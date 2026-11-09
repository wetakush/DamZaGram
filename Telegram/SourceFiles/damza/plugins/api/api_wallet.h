// This is the source code of DamZaGram for Desktop,
// a fork of AyuGram for Desktop.
#pragma once

#include <optional>

namespace Damza::Plugins {

[[nodiscard]] bool StarsBalanceAvailable();
[[nodiscard]] std::optional<MTPpayments_PaymentResult> FakeStarsPaymentResult();

} // namespace Damza::Plugins
