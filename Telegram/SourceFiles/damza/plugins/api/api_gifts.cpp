// This is the source code of DamZaGram for Desktop,
// a fork of AyuGram for Desktop.
//
// dzg.gifts: intercept the "Offer to Buy" action on a unique (NFT) gift.
// A plugin registers dzg.gifts.onOffer(fn); the client then shows the same
// native price box (amount + currency), and on confirm hands the chosen
// values to the plugin instead of sending a real offer to Telegram.
#include "damza/plugins/plugin_api.h"
#include "damza/plugins/plugins.h"

#include "apiwrap.h"
#include "api/api_premium.h"
#include "base/unixtime.h"
#include "base/weak_qptr.h"
#include "chat_helpers/compose/compose_show.h"
#include "core/credits_amount.h"
#include "damza/plugins/plugin_bridge.h"
#include "damza/plugins/plugin_data.h"
#include "damza/plugins/plugin_instance.h"
#include "damza/plugins/plugin_manager.h"
#include "data/components/credits.h"
#include "data/data_msg_id.h"
#include "data/data_peer.h"
#include "data/data_session.h"
#include "data/data_star_gift.h"
#include "history/view/controls/history_view_suggest_options.h"
#include "main/main_session.h"
#include "ui/layers/box_content.h"
#include "ui/layers/generic_box.h"
#include "window/window_controller.h"

#include <QtCore/QUrl>

namespace Damza::Plugins {
namespace {

// Fake gifts hung on the current user's own profile, per session. Each slug
// resolves to a real gift object, so everything (open, attributes, wear) works.
struct SessionGifts {
	std::vector<Data::SavedStarGift> list;
	std::vector<QString> slugs; // parallel to list, for de-dup and remove
	bool localBuy = false;
};
base::flat_map<not_null<Main::Session*>, SessionGifts> GiftsBySession;
rpl::event_stream<not_null<Main::Session*>> GiftsUpdated;

// Fake, locally-unique manage ids so the entries don't collide with real ones.
int64 FakeManageCounter = 0;

[[nodiscard]] QString ExtractSlug(QString input) {
	auto slug = input.trimmed();
	// Accept a bare slug, t.me/nft/<slug>, or an nft?slug=<slug> link.
	if (const auto at = slug.indexOf(u"nft/"_q); at >= 0) {
		slug = slug.mid(at + 4);
	}
	if (const auto at = slug.indexOf(u"slug="_q); at >= 0) {
		slug = slug.mid(at + 5);
	}
	slug = slug.split('?').front().split('&').front().split('/').front();
	return slug.trimmed();
}

[[nodiscard]] Data::SavedStarGift WrapGift(Data::StarGift info) {
	const auto unique = (info.unique != nullptr);
	// SavedStarGift has no default constructor (StarGift::document is
	// not_null), so build it as an aggregate with the gift moved in.
	return Data::SavedStarGift{
		.info = std::move(info),
		// A positive, locally-unique id well away from real message ids.
		.manageId = Data::SavedStarGiftId::User(
			MsgId(2000000000 + (++FakeManageCounter))),
		.date = base::unixtime::now(),
		.pinned = unique, // only unique (NFT) gifts can pin to the top
		.mine = true,
	};
}

void NotifyChanged(not_null<Main::Session*> session) {
	GiftsUpdated.fire(std::move(session));
}

void AddGift(
		not_null<Main::Session*> session,
		Data::StarGift info,
		const QString &slug) {
	auto &entry = GiftsBySession[session];
	if (!slug.isEmpty() && ranges::contains(entry.slugs, slug)) {
		return; // already on the profile
	}
	entry.slugs.push_back(slug);
	entry.list.insert(entry.list.begin(), WrapGift(std::move(info)));
	NotifyChanged(session);
}

// Plugin ids that registered a gift-offer handler.
base::flat_set<QString> Intercepting;

// A plain, locale-independent decimal for the bot command: '2600', '2.5'.
// Never a thousands separator (a space would split the command argument).
[[nodiscard]] QString PlainAmount(CreditsAmount price) {
	const auto whole = QString::number(price.whole());
	const auto nano = price.nano();
	if (!nano) {
		return whole;
	}
	auto frac = QString::number(nano).rightJustified(9, '0');
	while (frac.endsWith('0')) {
		frac.chop(1);
	}
	return whole + '.' + frac;
}

[[nodiscard]] QVariantMap OfferPayload(
		not_null<Data::UniqueGift*> unique,
		not_null<PeerData*> owner,
		SuggestOptions options) {
	const auto price = options.price();
	return {
		{ u"slug"_q, unique->slug },
		{ u"link"_q, u"https://t.me/nft/"_q + unique->slug },
		{ u"title"_q, Data::UniqueGiftName(*unique) },
		{ u"amount"_q, PlainAmount(price) },
		{ u"amountNumber"_q, price.value() },
		{ u"currency"_q, price.ton() ? u"ton"_q : u"stars"_q },
		{ u"duration"_q, options.offerDuration },
		{ u"ownerId"_q, PeerIdToString(owner->id) },
		{ u"ownerUsername"_q, owner->username() },
		{ u"ownerName"_q, owner->name() },
	};
}

} // namespace

bool InterceptGiftOffer(
		std::shared_ptr<ChatHelpers::Show> show,
		std::shared_ptr<Data::UniqueGift> unique) {
	if (Intercepting.empty() || !show || !unique || !Manager::Exists()) {
		return false;
	}
	using namespace HistoryView;
	const auto owner = show->session().data().peer(unique->ownerId);
	const auto weak = std::make_shared<base::weak_qptr<Ui::BoxContent>>();
	const auto done = [=](SuggestOptions result) {
		if (Manager::Exists()) {
			const auto payload = QVariant(OfferPayload(
				unique.get(),
				owner,
				result));
			// Snapshot the ids: a handler may reload plugins.
			const auto ids = Intercepting;
			for (const auto &id : ids) {
				if (const auto plugin = Manager::Get().instance(id)) {
					plugin->dispatch(u"gift:offer"_q, payload);
				}
			}
		}
		if (const auto strong = weak->get()) {
			strong->closeBox();
		}
	};
	auto options = SuggestOptions{
		.exists = 1,
		.priceWhole = uint32(std::max(unique->starsMinOffer, 0)),
	};
	auto priceBox = Box(ChooseSuggestPriceBox, SuggestPriceBoxArgs{
		.peer = owner,
		.done = done,
		.value = options,
		.mode = SuggestMode::Gift,
		.giftName = Data::UniqueGiftName(*unique),
	});
	*weak = priceBox.data();
	show->show(std::move(priceBox));
	return true;
}

std::vector<Data::SavedStarGift> SelfProfileGifts(not_null<PeerData*> peer) {
	if (!peer->isSelf()) {
		return {};
	}
	const auto i = GiftsBySession.find(&peer->session());
	return (i != end(GiftsBySession)) ? i->second.list : std::vector<Data::SavedStarGift>();
}

rpl::producer<> ProfileGiftsUpdates(not_null<Main::Session*> session) {
	return GiftsUpdated.events(
	) | rpl::filter([=](not_null<Main::Session*> which) {
		return which == session;
	}) | rpl::to_empty;
}

bool TryLocalBuyGift(
		not_null<PeerData*> recipient,
		const Data::StarGift &gift) {
	const auto session = &recipient->session();
	const auto i = GiftsBySession.find(session);
	if (i == end(GiftsBySession) || !i->second.localBuy) {
		return false;
	} else if (!recipient->isSelf()) {
		return false; // a local buy can only flex on your own profile
	}
	// Spend the (possibly faked) Stars balance locally.
	auto &credits = session->credits();
	const auto have = credits.balance().whole();
	credits.apply(CreditsAmount(std::max<int64>(0, have - gift.stars)));
	const auto slug = gift.unique ? gift.unique->slug : QString();
	AddGift(session, gift, slug);
	return true;
}

DZG_API_MODULE({
	.name = "gifts",
	.natives = [](not_null<Bridge*> bridge, std::vector<Js::NativeMethod> &out) {
		const auto id = bridge->instance()->manifest().id;
		out.push_back({ "gifts_setIntercept", [=](const QVariantList &args) {
			if (args.value(0).toBool()) {
				Intercepting.emplace(id);
			} else {
				Intercepting.remove(id);
			}
			return QVariant();
		} });
		out.push_back({ "gifts_close", [](const QVariantList &) {
			if (Manager::Exists()) {
				if (const auto window = Manager::Get().activeWindow()) {
					window->hideLayer();
				}
			}
			return QVariant();
		} });
		// Resolve a real NFT gift by slug/link and hang it on your own
		// profile. Async: returns a request id, settles with the slug.
		out.push_back({ "gifts_addProfile", [=](const QVariantList &args) {
			const auto requestId = bridge->nextRequestId();
			const auto settle = [id, requestId](bool ok, QVariant value) {
				if (!Manager::Exists()) {
					return;
				}
				if (const auto plugin = Manager::Get().instance(id)) {
					plugin->dispatch(u"settle"_q, QVariant(QVariantMap{
						{ u"id"_q, requestId },
						{ u"ok"_q, ok },
						{ u"value"_q, std::move(value) },
					}));
				}
			};
			const auto session = Manager::Get().activeSession();
			const auto slug = ExtractSlug(args.value(0).toString());
			if (!session || slug.isEmpty()) {
				settle(false, u"no session or slug"_q);
				return QVariant(requestId);
			}
			session->api().request(MTPpayments_GetUniqueStarGift(
				MTP_string(slug))
			).done([=](const MTPpayments_UniqueStarGift &result) {
				const auto &data = result.data();
				session->data().processUsers(data.vusers());
				if (auto gift = Api::FromTL(session, data.vgift())) {
					AddGift(session, std::move(*gift), slug);
					settle(true, slug);
				} else {
					settle(false, u"could not read gift"_q);
				}
			}).fail([=](const MTP::Error &error) {
				settle(false, error.type());
			}).send();
			return QVariant(requestId);
		} });
		out.push_back({ "gifts_removeProfile", [](const QVariantList &args) {
			const auto session = Manager::Get().activeSession();
			if (!session) {
				return QVariant(false);
			}
			const auto slug = ExtractSlug(args.value(0).toString());
			const auto i = GiftsBySession.find(session);
			if (i == end(GiftsBySession)) {
				return QVariant(false);
			}
			auto &entry = i->second;
			auto removed = false;
			for (auto j = 0; j != int(entry.slugs.size());) {
				if (entry.slugs[j] == slug) {
					entry.slugs.erase(entry.slugs.begin() + j);
					entry.list.erase(entry.list.begin() + j);
					removed = true;
				} else {
					++j;
				}
			}
			if (removed) {
				NotifyChanged(session);
			}
			return QVariant(removed);
		} });
		out.push_back({ "gifts_clearProfile", [](const QVariantList &) {
			const auto session = Manager::Get().activeSession();
			if (!session) {
				return QVariant(false);
			}
			const auto i = GiftsBySession.find(session);
			if (i == end(GiftsBySession) || i->second.list.empty()) {
				return QVariant(false);
			}
			i->second.list.clear();
			i->second.slugs.clear();
			NotifyChanged(session);
			return QVariant(true);
		} });
		out.push_back({ "gifts_listProfile", [](const QVariantList &) {
			const auto session = Manager::Get().activeSession();
			auto result = QVariantList();
			if (!session) {
				return QVariant(result);
			}
			const auto i = GiftsBySession.find(session);
			if (i == end(GiftsBySession)) {
				return QVariant(result);
			}
			for (const auto &saved : i->second.list) {
				const auto unique = saved.info.unique.get();
				result.push_back(QVariantMap{
					{ u"slug"_q, unique ? unique->slug : QString() },
					{ u"title"_q, unique ? Data::UniqueGiftName(*unique) : QString() },
					{ u"number"_q, unique ? unique->number : 0 },
					{ u"pinned"_q, saved.pinned },
				});
			}
			return QVariant(result);
		} });
		out.push_back({ "gifts_setLocalBuy", [](const QVariantList &args) {
			const auto session = Manager::Get().activeSession();
			if (session) {
				GiftsBySession[session].localBuy = args.value(0).toBool();
			}
			return QVariant();
		} });
	},
	.prelude = [] {
		return QString::fromUtf8(R"DZG_JS(
	const handlers = [];
	internal.on('gift:offer', (payload) => {
		for (const fn of handlers.slice()) {
			internal.safe('gifts.onOffer', fn, payload);
		}
	});
	dzg.gifts = {
		// Закрыть окна подарка и профиля, вернуться в чат.
		close() { native.gifts_close(); },
		onOffer(fn) {
			if (typeof fn !== 'function') {
				throw new TypeError('onOffer expects a function');
			}
			handlers.push(fn);
			if (handlers.length === 1) native.gifts_setIntercept(true);
			return () => {
				const index = handlers.indexOf(fn);
				if (index >= 0) handlers.splice(index, 1);
				if (!handlers.length) native.gifts_setIntercept(false);
			};
		},
		profile: {
			add(slugOrLink) {
				return internal.request(
					() => native.gifts_addProfile(String(slugOrLink || '')));
			},
			remove(slug) { return !!native.gifts_removeProfile(String(slug || '')); },
			clear() { return !!native.gifts_clearProfile(); },
			list() { return native.gifts_listProfile() || []; },
		},
		localBuy(enable) { native.gifts_setLocalBuy(enable !== false); },
	};
)DZG_JS");
	},
	.pluginUnloaded = [](const QString &id) {
		Intercepting.remove(id);
		// Drop the fake profile gifts so unloading the plugin clears the flex.
		for (auto &[session, entry] : GiftsBySession) {
			if (!entry.list.empty() || entry.localBuy) {
				entry.list.clear();
				entry.slugs.clear();
				entry.localBuy = false;
				NotifyChanged(session);
			}
		}
	},
});

} // namespace Damza::Plugins
