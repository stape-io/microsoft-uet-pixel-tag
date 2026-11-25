# Microsoft Ads UET Pixel for Google Tag Manager Web

The **Microsoft Ads UET Pixel by Stape** tag integrates the **[Microsoft Advertising Universal Event Tracking (UET) tag](https://help.ads.microsoft.com/#apex/ads/en/56686/2)** into your website via a Google Tag Manager Web container. It tracks page views, conversions (custom events, variable revenue, enhanced conversions) and remarketing events (dynamic remarketing, hotel and travel) for Microsoft Advertising.

It replaces GTM's built-in _Microsoft Advertising Universal Event Tracking_ tag. Its main additions:
- **Automatic Data Layer mapping** of GA4 e-commerce data.
- **Multiple UET Tag IDs** in the same tag.
- **Consent Mode support**: Google Consent Mode, manual consent, Advanced/Basic modes, IAB TCF.
- **Event ID** for deduplication with the [Microsoft UET Conversions API tag](https://github.com/stape-io/microsoft-capi-tag).

## How to Use

1. Add the **Microsoft Ads UET Pixel by Stape** tag to your GTM container from the [GTM Template Gallery](https://tagmanager.google.com/gallery/#/owners/stape-io/templates/microsoft-uet-pixel-tag).
2. Enter your **UET Tag ID(s)** (found in Microsoft Advertising under _Conversion Tracking → UET tags_). It accepts a single ID, a comma-separated list or an array, to send the same events to more than one UET Tag ID.
3. Choose how the **Event Name** is defined:
   - **Override**: choose **Page View**, a **Standard Event** (Microsoft predefined event action) or a **Custom Event**.
   - **Inherit from DataLayer**: uses the Data Layer event name as the UET event action.
4. Create a **Page View** tag that fires on all pages (e.g. _Initialization - All Pages_). Then create event tags for your conversions and remarketing events.
5. Keep **Automatic Data Layer Mapping** enabled (recommended) to auto-map e-commerce parameters and user data.
6. (Optional) Keep **Enhanced Conversions** enabled to send the user's email address and/or phone number.
7. (Optional) Configure the **Consent Settings**.
8. (Optional) Set the **Event ID** to deduplicate events also sent through the Microsoft UET Conversions API.
9. (Optional) Fine-tune the **UET Tag Settings** (SPA tracking, cookies, queue name and other UET options).

No tag sequencing is needed: every tag loads `bat.js` and initializes the UET tag if it isn't initialized yet.

## Event Name Setup Options

### Override

- **Page View**: the first Page View on the page sends the UET page load hit. Any later Page View on the same page is sent as a virtual page view (`page_view` event with the current `page_path` and `page_title`). For example, a Page View fired on _History Change_ in a Single Page Application. If **Disable the automatic page load hit** is enabled, every Page View is sent as a virtual page view, including the first one (see [UET Tag Settings](#uet-tag-settings)).
- **Standard Event**: one of the [Microsoft Advertising predefined event actions](https://help.ads.microsoft.com/#apex/ads/en/56684/2): `add_payment_info`, `add_to_cart`, `add_to_wishlist`, `begin_checkout`, `checkout_progress`, `exception`, `generate_lead`, `login`, `purchase`, `refund`, `remove_from_cart`, `screen_view`, `search`, `select_content`, `set_checkout_option`, `share`, `sign_up`, `timing_complete`, `view_item`, `view_item_list`, `view_promotion`, `view_search_results`.
- **Custom Event**: any event action. It can be left empty if your conversion goal is defined only by Event Category, Event Label or Event Value (e.g. variable revenue goals).

### Inherit from DataLayer

The Microsoft predefined event actions follow the GA4 naming, so GA4 event names are sent as they are. The following mappings are applied:

| DataLayer Event | UET Event |
|---|---|
| `page_view`, `gtm.init`, `gtm.js`, `gtm.dom`, `gtm.load`, `gtm.historyChange`, `gtm.historyChange-v2` | Page View |
| Stape events ending with `_stape` (e.g. `purchase_stape`) | The event name without the suffix (e.g. `purchase`) |
| `gtm4wp.productImpressionEEC` | `view_item_list` |
| `gtm4wp.productClickEEC` | `select_content` |
| `gtm4wp.changeDetailViewEEC` | `view_item` |
| `gtm4wp.addProductToCartEEC` | `add_to_cart` |
| `gtm4wp.removeFromCartEEC` | `remove_from_cart` |
| `gtm4wp.checkoutStepEEC` | `begin_checkout` |
| `gtm4wp.checkoutOptionEEC` | `set_checkout_option` |
| `gtm4wp.orderCompletedEEC` | `purchase` |

Any other event name is sent as is.

## Features

### Multiple UET Tag IDs

The **UET Tag ID(s)** field accepts a single ID, a comma-separated list (e.g. `1234567, 7654321`) or an array. The same consent signals, page views and events are sent to every UET Tag ID.

Unlike the Meta and TikTok pixels, the UET tag (`bat.js`) supports a single UET Tag ID per instance, and each instance lives in its own global variable, the queue (`window.uetq` by default). The template gives each UET Tag ID its own queue:
- the first UET Tag ID that fires on the page, in any tag of this template, uses the **UET Queue Name** (`uetq` by default);
- every other UET Tag ID uses the queue name followed by `_` and its UET Tag ID (e.g. `uetq_7654321`).

A UET Tag ID keeps its queue for the whole page, so the order of the IDs only matters in the first tag that fires. For example, if the Page View tag has `1234567, 7654321` and a purchase tag has `7654321`, `1234567` uses `uetq` and `7654321` uses `uetq_7654321` in both tags.

To control which UET Tag ID gets `uetq` (e.g. if custom code on the website pushes to `window.uetq` directly), put it first in the Page View tag that fires first on the page. Custom code can reach any other UET Tag ID through its own queue, e.g. `window.uetq_7654321`.

### Automatic Data Layer Mapping

When enabled, the tag parses the Data Layer and maps:

- **Microsoft UET native keys**: `revenue_value`, `currency`, `transaction_id`, `ecomm_prodid`, `ecomm_pagetype`, `ecomm_totalvalue`, `ecomm_category`, `ecomm_query`, `event_category`, `event_label`, `event_value`.
- **GA4 e-commerce**:
  - `items[]` is mapped to `items` (`id`, `name`, `price`, `quantity`, `brand`, `category`, `variant`) and to `ecomm_prodid`.
  - `value` is mapped to `revenue_value` and `ecomm_totalvalue`. If there is no `value`, the sum of the items' `price * quantity` is used.
  - `currency` is mapped as is, falling back to `items[0].currency`.
  - `transaction_id`, `coupon`, `tax`, `shipping` and `search_term` are mapped as is. `search_term` is also mapped to `ecomm_query`.
- **Ecomm Page Type**: derived from the event when product IDs are present. For example, `view_item` → `product`, `view_item_list` → `category`, `search` → `searchresults`, `view_cart` → `cart`, `purchase` → `purchase`; any other event → `other`.
- **User Data** from the `user_data` object:
  - `email`, `email_address`, `em` or `sha256_email_address`;
  - `phone_number`, `phone`, `ph` or `sha256_phone_number`.

> **Note:** GTM merges the Data Layer pushes, so the e-commerce data of a previous event (e.g. `purchase`) is still read by a later event on the same page (e.g. `sign_up`). Push `ecommerce: null` before each e-commerce push (as recommended by Google for GA4), and disable this option on tags for non e-commerce events if needed. Disabling it also turns off the automatic User Data mapping on those tags.

Use the **"Most Recent Data Layer Event Only"** option to read only the most recent Data Layer push where the data is found (Data Layer version 1), ignoring recursive merges.

Event Parameters are not sent with the Page View, except `page_path`, `page_title` and `page_location` on virtual (SPA) page views.

### Event Parameters

Add or override parameters using a variable that returns an object, or the **Event Parameters** table. The table supports:
- custom event fields (`event_category`, `event_label`, `event_value`);
- variable revenue (`revenue_value`, `currency`);
- e-commerce and dynamic remarketing fields (`items`, `ecomm_prodid`, `ecomm_pagetype`, `ecomm_totalvalue`, `ecomm_category`, `ecomm_query`, `transaction_id`, …);
- [hotel](https://help.ads.microsoft.com/#apex/ads/en/56955/2) (`hct_*`) and travel (`travel_*`) fields.

The UET tag ignores any parameter that is not part of its specification. It also rejects events with product IDs and no valid page type. To prevent that, the tag lowercases the page type and falls back to `other`. It also uppercases the currency.

### Enhanced Conversions

When enabled, the tag sends the user's **email address** and/or **phone number** (E.164 format) to Microsoft Advertising.
- **Page Views:** the user data is set for the page with `set` / `pid`.
- **Events:** the user data is sent in the event's `pid` parameter.

The UET tag itself normalizes and SHA-256 hashes plain-text values in the browser. Already hashed values are also accepted. Enhanced conversions must also be enabled in your Microsoft Advertising account. [Learn more](https://help.ads.microsoft.com/#apex/ads/en/60178/2).

User data can be sourced from:
- the Data Layer (`user_data` object);
- a variable, such as a User-Provided Data variable;
- the User Data table.

### Event User Data Enhancement

When enabled, the user data is stored in `localStorage` under the key `gtmeec-ms` and reused on the next events and page views. The tag normalizes the values the same way as the UET tag and SHA-256 hashes them before storing them, so only hashed data is stored.

`localStorage` is not read or written when the Ad Storage consent is denied.

### Consent Settings

The tag sends the consent state to the UET tag using the [UET Consent Mode](https://help.ads.microsoft.com/#apex/ads/en/60119/2) commands: `consent` `default` for the first signal on the page, then `update` for changes. It sends them before the UET tag is initialized.

- **Google Consent Mode support**: forwards the Google Consent Mode `ad_storage` state, including later changes on the page.
  > **Important:** only enable it if a Consent Management Platform sets the Google Consent Mode state on every page, with the default state set before this tag fires (e.g. on _Consent Initialization - All Pages_). GTM considers an unset `ad_storage` as granted, so without it this tag sends `granted` to the UET tag. That overrides the default `denied` state Microsoft enforces in the EEA, the UK and Switzerland, and the UET tag would set its cookies without the user's consent.
- **Ad Storage Consent** (manual): `granted`/`denied` (also `true`/`false`, `1`/`0`), usually from a variable. Make sure it reflects the user's actual choice: like any consent signal sent by this tag, it overrides the default `denied` state Microsoft enforces in the EEA, the UK and Switzerland. If not set, no consent signal is sent and the UET tag applies its own defaults.
- **Behavior when Ad Storage consent is denied**:
  - **Advanced Consent Mode** (default, recommended): the UET tag loads and sends cookieless pings, without cookies or identifiers, which Microsoft uses for conversion modeling.
  - **Basic Consent Mode**: nothing is loaded or sent while consent is denied.
    - With Google Consent Mode support, events are queued and sent once consent is granted on the page.
    - With the manual **Ad Storage Consent** field, events fired while it is denied are dropped. If the field is empty, consent is not considered denied and events are sent.
- **IAB TCF v2 support**: lets the UET tag read the consent from your TCF Consent Management Platform. Microsoft recommends not using it together with Consent Mode.
- **Disable automatic consent detection** (`enableAutoConsent: false`): by default, where Microsoft enforces Consent Mode (e.g. EEA, UK and Switzerland), the UET tag tries to read the consent on its own from the Google Consent Mode state and from IAB TCF v2. Check it so that UET only uses the consent signals configured in this tag (the UET Consent Mode commands and, if enabled, IAB TCF v2). Like the UET Tag Settings below, it's applied by the first tag that fires on the page with each UET Tag ID.
- **Restricted Event Processing (REP)**: flags the events for Restricted Event Processing.

### Server-Side Deduplication

If you track the same events through the [Microsoft UET Conversions API tag](https://github.com/stape-io/microsoft-capi-tag), set the same **Event ID** in both tags. On the web tag it's sent as `event_id`; on the CAPI tag it's `eventId`. Also use the same UET Tag ID and event action.
- Enable **Push event to DataLayer with the Event ID** to create a Data Layer event with the Event ID. That event can trigger the tag that sends data to your server container.
- **The Event ID is not supported for Page View events** (the page load hit and the SPA `page_view` events), so this tag doesn't send it with them and they can't be deduplicated. For Page Views, use **either** this tag **or** the Microsoft UET Conversions API tag, not both, otherwise they are counted twice.

### UET Tag Settings

These settings are applied when the UET tag of each UET Tag ID is initialized, i.e. by the first tag that fires on the page with that UET Tag ID. Keep them consistent across all your tags that use the same UET Tag ID.

- **Automatic SPA Page View Tracking** (`enableAutoSpaTracking`): if you enable it, don't also fire a Page View tag on _History Change_.
- **Disable the automatic page load hit** (`disableAutoPageView`): for Single Page Applications, following Microsoft's [_All pages, auto-disabled_](https://help.ads.microsoft.com/#apex/ads/en/56688/2) setup. The UET tag then ignores its automatic page load hit, so:
  - the template sends **every** Page View as a virtual page view, including the first one on the page: a `page_view` event with the current `page_path` (path and query string) and `page_title`. The UET tag adds the referrer and page load data to the first one, so it replaces the page load hit;
  - fire the Page View tag on all pages and on _History Change_, before the other UET tags of the same page or route, since the UET tag attributes each event to the last page view sent;
  - enable it in all your tags with the same UET Tag ID. The UET tag only uses the setting of the first tag that initializes it, so a Page View tag without it would send a page load hit that the UET tag ignores.
- **Disable first-party cookies** (`storeConvTrackCookies: false`).
- **Remove the query string from the URLs** (`removeQueryFromUrls`).
- **Send Navigation Timing data** (`navTimingApi`).
- **Cookie Domain** (`cookieDomain`) and **Cookie Flags** (`cookieFlags`).
- **UET Queue Name** (default `uetq`): the base name of the queues (see [Multiple UET Tag IDs](#multiple-uet-tag-ids)). Use the same name in all your tags of this template, and change it only if a UET tag outside this template (e.g. hardcoded on the website, or GTM's built-in UET tag) already uses `uetq`. Otherwise, the events would be sent to that UET Tag ID instead.
- **Additional UET Tag Configuration**: any other option of the UET tag initialization object. `"true"` and `"false"` are converted to booleans.

## Useful Resources

- [Microsoft Advertising: What is UET and how can it help me?](https://help.ads.microsoft.com/#apex/ads/en/56686/2)
- [Microsoft Advertising: Custom events](https://help.ads.microsoft.com/#apex/ads/en/56684/2)
- [Microsoft Advertising: Enhanced conversions](https://help.ads.microsoft.com/#apex/ads/en/60178/2)
- [Microsoft Advertising: Consent Mode](https://help.ads.microsoft.com/#apex/ads/en/60119/2)
- [Microsoft Advertising: UET Tag Helper](https://help.ads.microsoft.com/#apex/ads/en/56775/2)
- [Microsoft UET Conversions API Tag by Stape](https://github.com/stape-io/microsoft-capi-tag)

## Credits

This template was built from an idea by **David Lüchinger**, SEO & SEA Senior Consultant and SEA Lead at Meili & Hess GmbH, one of the winning ideas of the Stape Relay 2026 GTM Templates Competition.

## Open Source

The **Microsoft Ads UET Pixel for Google Tag Manager Web** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
