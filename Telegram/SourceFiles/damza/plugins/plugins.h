// This is the source code of DamZaGram for Desktop,
// a fork of AyuGram for Desktop.
#pragma once

#include <memory>
#include <vector>

#include <rpl/producer.h>

// Entry points the rest of the client calls into the plugin system.
// Everything here is safe to call before plugins are loaded: it is a no-op.

class HistoryItem;
class PeerData;

namespace Api {
struct MessageToSend;
} // namespace Api

namespace Ui {
class PopupMenu;
} // namespace Ui

namespace Ui::Menu {
struct MenuCallback;
} // namespace Ui::Menu

namespace ChatHelpers {
class Show;
} // namespace ChatHelpers

namespace Data {
struct UniqueGift;
struct StarGift;
struct SavedStarGift;
} // namespace Data

namespace Data {
struct CreditsStatusSlice;
} // namespace Data

namespace Main {
class Session;
} // namespace Main

namespace Damza::Plugins {

// Called once the primary window has been shown.
void Start();

// Called from Core::Application destructor, while windows and sessions live.
void Shutdown();

// True if some plugin asked to hide this message.
[[nodiscard]] bool Filtered(not_null<HistoryItem*> item);

// Lets plugins rewrite or swallow an outgoing text message.
// Returns false when the message must not be sent.
[[nodiscard]] bool BeforeSend(Api::MessageToSend &message);

// Notifies plugins that the server deleted the message.
void MessageDeleted(not_null<HistoryItem*> item);

// Appends plugin actions to a message context menu.
void FillMessageMenu(not_null<Ui::PopupMenu*> menu, HistoryItem *item);

// Appends plugin actions to a chat (peer) menu.
void FillPeerMenu(PeerData *peer, const Ui::Menu::MenuCallback &addAction);

// NFT gift "offer to buy": if a plugin registered dzg.gifts.onOffer, show the
// native price box and hand the chosen amount and currency to the plugin,
// instead of sending a real offer. Returns true when a plugin took over.
[[nodiscard]] bool InterceptGiftOffer(
	std::shared_ptr<ChatHelpers::Show> show,
	std::shared_ptr<Data::UniqueGift> unique);

// Prepends plugin-provided fake entries to a Stars transactions list.
// `in` / `out` say which directions this list shows (full tab: both).
void InjectCreditsHistory(
	not_null<Main::Session*> session,
	Data::CreditsStatusSlice &slice,
	bool in,
	bool out);

// True if a plugin asked to show the total reaction count in the bottom
// info line, next to views and forwards. See dzg.reactions.showTotal.
[[nodiscard]] bool ShowReactionsTotal();

// Fake NFT gifts a plugin hung on the current user's own profile. Each is a
// real resolved gift object (dzg.gifts.profile.add resolves it by slug), so
// it opens and behaves like a genuine gift. Returns {} unless `peer` is the
// current user of its session. The profile gifts tab injects these for self.
[[nodiscard]] std::vector<Data::SavedStarGift> SelfProfileGifts(
	not_null<PeerData*> peer);

// Fires when the self fake-gift list of `session` changed, so an open profile
// gifts tab can reload.
[[nodiscard]] rpl::producer<> ProfileGiftsUpdates(
	not_null<Main::Session*> session);

// Local "buy": when dzg.gifts.localBuy is on, sending a star gift to yourself
// spends the (possibly faked) Stars balance locally and hangs the gift on your
// own profile instead of hitting the server. Returns true when it took over.
[[nodiscard]] bool TryLocalBuyGift(
	not_null<PeerData*> recipient,
	const Data::StarGift &gift);

} // namespace Damza::Plugins
