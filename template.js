const addConsentListener = require('addConsentListener');
const callInWindow = require('callInWindow');
const copyFromDataLayer = require('copyFromDataLayer');
const createQueue = require('createQueue');
const getType = require('getType');
const getUrl = require('getUrl');
const injectScript = require('injectScript');
const isConsentGranted = require('isConsentGranted');
const JSON = require('JSON');
const localStorage = require('localStorage');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const makeTableMap = require('makeTableMap');
const Object = require('Object');
const readTitle = require('readTitle');
const sha256 = require('sha256');
const templateStorage = require('templateStorage');

// Call-once methods.
let gtmOnSuccess = () => {
  gtmOnSuccess = () => {};
  return data.gtmOnSuccess();
};

let gtmOnFailure = () => {
  gtmOnFailure = () => {};
  return data.gtmOnFailure();
};

/*==============================================================================
==============================================================================*/

const SCRIPT_URL = 'https://bat.bing.com/bat.js';
const USER_DATA_STORAGE_KEY = 'gtmeec-ms';

const baseQueueName = isValidValue(data.uetqName) ? makeString(data.uetqName).trim() : 'uetq';
const uetTags = getUetTags(data, baseQueueName);
if (uetTags.length === 0) {
  return gtmOnFailure();
}

const consentState = getConsentState(data);

// Basic consent mode: nothing is loaded or sent while consent is denied.
if (data.consentMode === 'basic' && consentState === 'denied') {
  if (data.enableGoogleConsentMode) {
    runOnAdStorageGranted(baseQueueName, () => sendEvent(data, 'granted'));
  }
  return gtmOnSuccess();
}

sendEvent(data, consentState);

/*==============================================================================
  Vendor related functions
==============================================================================*/

// Each UET Tag ID needs its own UET instance and, therefore, its own global queue.
// The first Tag ID uses the configured queue name and the others get a queue name derived from it.
function getUetTags(data, baseQueueName) {
  const tagIds =
    getType(data.tagId) === 'array' ? data.tagId : makeString(data.tagId || '').split(',');
  const uetTags = [];
  const addedTagIds = {};

  tagIds.forEach((tagId) => {
    if (!isValidValue(tagId)) return;
    const normalizedTagId = makeString(tagId).trim();
    if (!normalizedTagId || addedTagIds[normalizedTagId]) return;
    addedTagIds[normalizedTagId] = true;
    uetTags.push({
      tagId: normalizedTagId,
      queueName: getQueueName(baseQueueName, normalizedTagId)
    });
  });

  return uetTags;
}

// UET supports one Tag ID per queue, and a queue keeps the Tag ID it was first initialized with.
// So each Tag ID keeps the same queue on the page, whatever its position in the tag's list of Tag IDs:
// the first Tag ID ever seen gets the base queue name and the others get "<base queue name>_<Tag ID>".
function getQueueName(baseQueueName, tagId) {
  const queueNamesKey = 'uet_queue_names_' + baseQueueName;
  const queueNames = templateStorage.getItem(queueNamesKey) || {};
  if (queueNames[tagId]) return queueNames[tagId];

  const isBaseQueueNameTaken = Object.keys(queueNames).some(
    (storedTagId) => queueNames[storedTagId] === baseQueueName
  );
  queueNames[tagId] = isBaseQueueNameTaken ? baseQueueName + '_' + tagId : baseQueueName;
  templateStorage.setItem(queueNamesKey, queueNames);

  return queueNames[tagId];
}

function sendEvent(data, consentState) {
  const eventInfo = getEventInfo(data);
  const eventParameters = getEventParameters(data, eventInfo);
  const userData = getUserData(data, consentState);

  pushEventIdToDataLayer(data);

  injectScript(
    SCRIPT_URL,
    () => {
      uetTags.forEach((uetTag) => {
        sendEventToUetTag(data, uetTag, consentState, eventInfo, eventParameters, userData);
      });
      gtmOnSuccess();
    },
    gtmOnFailure,
    'uetPixel'
  );
}

function sendEventToUetTag(data, uetTag, consentState, eventInfo, eventParameters, userData) {
  const queueName = uetTag.queueName;
  const parameters = assign({}, eventParameters);

  sendConsentState(queueName, consentState);
  if (data.enableGoogleConsentMode) addGoogleConsentModeListener(queueName);
  if (data.enableTcf && !data.enableGoogleConsentMode) enableTcfOnce(queueName);

  const uetConfig = getUetConfig(data, uetTag.tagId);
  callInWindow('UET_init', queueName, uetConfig);

  if (isUIFieldTrue(data.restrictedEventProcessing)) {
    uetPush(queueName, 'set', { rep: '1' });
    if (!eventInfo.isPageView) parameters.rep = '1';
  }

  if (eventInfo.isPageView) {
    if (userData) uetPush(queueName, 'set', { pid: userData });
    sendPageView(queueName, parameters, uetConfig.disableAutoPageView === true);
  } else {
    if (userData) parameters.pid = userData;
    uetPush(queueName, 'event', eventInfo.eventAction, parameters);
  }
}

function getUetConfig(data, tagId) {
  const config = {
    ti: tagId
  };

  if (data.enableAutoSpaTracking) config.enableAutoSpaTracking = true;
  if (data.disableAutoPageView) config.disableAutoPageView = true;
  if (data.disableFirstPartyCookies) config.storeConvTrackCookies = false;
  if (data.removeQueryFromUrls) config.removeQueryFromUrls = true;
  if (data.navTimingApi) config.navTimingApi = true;
  if (data.disableAutoConsent) config.enableAutoConsent = false;
  if (data.cookieDomain) config.cookieDomain = makeString(data.cookieDomain);
  if (data.cookieFlags) config.cookieFlags = makeString(data.cookieFlags);

  if (data.customConfigList && data.customConfigList.length) {
    const customConfig = makeTableMap(data.customConfigList, 'name', 'value');
    Object.keys(customConfig).forEach((key) => {
      const value = customConfig[key];
      if (value === 'true') config[key] = true;
      else if (value === 'false') config[key] = false;
      else config[key] = value;
    });
  }

  return config;
}

function sendPageView(queueName, eventParameters, isAutoPageViewDisabled) {
  const pageLoadSentKey = 'uet_page_load_sent_' + queueName;

  // The first Page View on the page is the regular page load hit, unless the UET tag is set to
  // ignore it (disableAutoPageView), in which case every Page View is a virtual page view.
  if (!templateStorage.getItem(pageLoadSentKey)) {
    templateStorage.setItem(pageLoadSentKey, true);
    if (!isAutoPageViewDisabled) {
      uetPush(queueName, 'pageLoad');
      return;
    }
  }

  // Virtual page views (e.g. SPA history changes).
  const query = getUrl('query');
  const queryString = query ? (query.charAt(0) === '?' ? query : '?' + query) : '';
  const spaPageViewParameters = {
    page_path: eventParameters.page_path || getUrl('path') + queryString,
    page_title: eventParameters.page_title || readTitle()
  };
  if (eventParameters.page_location) {
    spaPageViewParameters.page_location = eventParameters.page_location;
  }

  uetPush(queueName, 'event', 'page_view', spaPageViewParameters);
}

function getEventInfo(data) {
  const PAGE_VIEW_EVENT_NAMES = ['page_view', 'pageLoad', 'pageView'];

  const toEventInfo = (eventName) => {
    const eventAction = isValidValue(eventName) ? makeString(eventName) : '';
    return {
      isPageView: PAGE_VIEW_EVENT_NAMES.indexOf(eventAction) !== -1,
      eventAction: eventAction
    };
  };

  if (data.eventNameSetupMethod === 'inherit') {
    const eventName = copyFromDataLayer('event');

    const dataLayerToUetEventName = {
      'gtm.init': 'page_view',
      'gtm.js': 'page_view',
      'gtm.dom': 'page_view',
      'gtm.load': 'page_view',
      'gtm.historyChange': 'page_view',
      'gtm.historyChange-v2': 'page_view',

      'gtm4wp.productImpressionEEC': 'view_item_list',
      'gtm4wp.productClickEEC': 'select_content',
      'gtm4wp.changeDetailViewEEC': 'view_item',
      'gtm4wp.addProductToCartEEC': 'add_to_cart',
      'gtm4wp.removeFromCartEEC': 'remove_from_cart',
      'gtm4wp.checkoutStepEEC': 'begin_checkout',
      'gtm4wp.checkoutOptionEEC': 'set_checkout_option',
      'gtm4wp.orderCompletedEEC': 'purchase'
    };

    let mappedEventName = dataLayerToUetEventName[eventName];
    if (!mappedEventName && getType(eventName) === 'string') {
      // Stape's Data Tag/Shopify App events have the "_stape" suffix (e.g. "purchase_stape").
      const suffix = '_stape';
      const suffixIndex = eventName.length - suffix.length;
      mappedEventName =
        suffixIndex > 0 && eventName.indexOf(suffix, suffixIndex) === suffixIndex
          ? eventName.substring(0, suffixIndex)
          : eventName;
    }

    return toEventInfo(mappedEventName);
  }

  if (data.eventType === 'pageView') return toEventInfo('page_view');
  if (data.eventType === 'standard') return toEventInfo(data.eventNameStandard);
  return toEventInfo(data.eventNameCustom);
}

function getEventParameters(data, eventInfo) {
  const eventParameters = {};

  if (data.enableDataLayerMapping && !eventInfo.isPageView) {
    addDataLayerEventParameters(eventParameters, eventInfo.eventAction);
  }

  if (getType(data.eventParametersFromVariable) === 'object') {
    assign(eventParameters, data.eventParametersFromVariable);
  }

  if (data.eventParametersList && data.eventParametersList.length) {
    assign(eventParameters, makeTableMap(data.eventParametersList, 'name', 'value'));
  }

  if (isValidValue(data.eventId)) eventParameters.event_id = makeString(data.eventId);

  return sanitizeEventParameters(eventParameters, eventInfo.eventAction);
}

function addDataLayerEventParameters(eventParameters, eventAction) {
  let ecommerce = copyFromDataLayerWithVersion('ecommerce');
  if (getType(ecommerce) !== 'object') ecommerce = {};

  // Microsoft UET native Data Layer keys (as shown in the Microsoft Advertising documentation).
  const uetNativeKeys = [
    'revenue_value',
    'currency',
    'transaction_id',
    'ecomm_prodid',
    'ecomm_pagetype',
    'ecomm_totalvalue',
    'ecomm_category',
    'ecomm_query',
    'event_category',
    'event_label',
    'event_value'
  ];
  uetNativeKeys.forEach((key) => {
    const value = copyFromDataLayerWithVersion(key);
    if (isValidValue(value)) eventParameters[key] = value;
  });

  addGA4EventParameters(eventParameters, ecommerce);

  if (eventParameters.ecomm_prodid && !eventParameters.ecomm_pagetype) {
    eventParameters.ecomm_pagetype = getPageTypeFromEventAction(eventAction);
  }

  return eventParameters;
}

function addGA4EventParameters(eventParameters, ecommerce) {
  const items = copyFromDataLayerWithVersion('items') || ecommerce.items;
  let currency =
    eventParameters.currency || ecommerce.currency || copyFromDataLayerWithVersion('currency');
  let valueFromItems;

  if (getType(items) === 'array' && items.length) {
    if (!currency && items[0] && items[0].currency) currency = items[0].currency;

    const mappedItems = [];
    const itemIds = [];
    valueFromItems = 0;

    items.forEach((i) => {
      if (getType(i) !== 'object') return;
      const item = {};
      const itemId = i.item_id || i.id;
      if (isValidValue(itemId)) {
        item.id = makeString(itemId);
        itemIds.push(item.id);
      }
      if (i.item_name || i.name) item.name = makeString(i.item_name || i.name);
      if (i.item_brand || i.brand) item.brand = makeString(i.item_brand || i.brand);
      if (i.item_category || i.category) {
        item.category = makeString(i.item_category || i.category);
      }
      if (i.item_variant || i.variant) item.variant = makeString(i.item_variant || i.variant);
      item.quantity = makeNumber(i.quantity) || 1;
      if (isValidValue(i.price)) {
        item.price = makeNumber(i.price);
        valueFromItems += item.quantity * item.price;
      }
      mappedItems.push(item);
    });

    if (mappedItems.length) eventParameters.items = mappedItems;
    if (itemIds.length && !eventParameters.ecomm_prodid) eventParameters.ecomm_prodid = itemIds;
  }

  if (currency) eventParameters.currency = currency;

  const value = isValidValue(ecommerce.value)
    ? ecommerce.value
    : copyFromDataLayerWithVersion('value');
  const revenueValue = isValidValue(value) ? makeNumber(value) : valueFromItems;
  if (isValidValue(revenueValue)) {
    if (!isValidValue(eventParameters.revenue_value)) eventParameters.revenue_value = revenueValue;
    if (!isValidValue(eventParameters.ecomm_totalvalue)) {
      eventParameters.ecomm_totalvalue = revenueValue;
    }
  }

  const transactionId = ecommerce.transaction_id || copyFromDataLayerWithVersion('transaction_id');
  if (transactionId && !eventParameters.transaction_id) {
    eventParameters.transaction_id = makeString(transactionId);
  }

  ['coupon', 'tax', 'shipping'].forEach((key) => {
    const fieldValue = isValidValue(ecommerce[key])
      ? ecommerce[key]
      : copyFromDataLayerWithVersion(key);
    if (isValidValue(fieldValue)) eventParameters[key] = fieldValue;
  });

  const searchTerm = copyFromDataLayerWithVersion('search_term') || ecommerce.search_term;
  if (searchTerm) {
    eventParameters.search_term = makeString(searchTerm);
    if (!eventParameters.ecomm_query) eventParameters.ecomm_query = makeString(searchTerm);
  }

  return eventParameters;
}

function getPageTypeFromEventAction(eventAction) {
  const eventActionToPageType = {
    view_item: 'product',
    add_to_cart: 'product',
    add_to_wishlist: 'product',
    view_item_list: 'category',
    search: 'searchresults',
    view_search_results: 'searchresults',
    view_cart: 'cart',
    remove_from_cart: 'cart',
    begin_checkout: 'cart',
    checkout_progress: 'cart',
    add_payment_info: 'cart',
    add_shipping_info: 'cart',
    purchase: 'purchase'
  };

  return eventActionToPageType[eventAction] || 'other';
}

function sanitizeEventParameters(eventParameters) {
  const VALID_PAGE_TYPES = [
    'home',
    'searchresults',
    'category',
    'product',
    'cart',
    'purchase',
    'other'
  ];

  Object.keys(eventParameters).forEach((key) => {
    if (!isValidValue(eventParameters[key])) Object.delete(eventParameters, key);
  });

  if (eventParameters.currency) {
    eventParameters.currency = makeString(eventParameters.currency).toUpperCase();
  }

  // bat.js throws (and drops the event) if the page type is invalid or missing when product IDs are present.
  if (eventParameters.ecomm_pagetype) {
    const pageType = makeString(eventParameters.ecomm_pagetype).toLowerCase();
    if (VALID_PAGE_TYPES.indexOf(pageType) !== -1) eventParameters.ecomm_pagetype = pageType;
    else Object.delete(eventParameters, 'ecomm_pagetype');
  }
  if (eventParameters.ecomm_prodid && !eventParameters.ecomm_pagetype) {
    eventParameters.ecomm_pagetype = 'other';
  }

  return eventParameters;
}

function getUserData(data, consentState) {
  if (!data.enableEnhancedConversions) return;

  const isStorageAllowed = data.enableEventUserDataEnhancement && consentState !== 'denied';
  const userData = {};

  if (isStorageAllowed) assign(userData, getStoredUserData());

  if (data.enableDataLayerMapping) {
    const userDataFromDataLayer = copyFromDataLayerWithVersion('user_data');
    if (getType(userDataFromDataLayer) === 'object') addUserData(userData, userDataFromDataLayer);
  }

  if (getType(data.userDataFromVariable) === 'object') {
    addUserData(userData, data.userDataFromVariable);
  }

  if (data.userDataList && data.userDataList.length) {
    const userDataFromList = makeTableMap(data.userDataList, 'name', 'value');
    if (isValidValue(userDataFromList.em)) userData.em = makeString(userDataFromList.em);
    if (isValidValue(userDataFromList.ph)) userData.ph = makeString(userDataFromList.ph);
  }

  if (!userData.em && !userData.ph) return;

  if (isStorageAllowed) storeUserData(userData);

  // bat.js normalizes and SHA-256 hashes the values that are not hashed yet.
  return userData;
}

function addUserData(userData, userDataFrom) {
  let email =
    userDataFrom.email ||
    userDataFrom.email_address ||
    userDataFrom.em ||
    userDataFrom.sha256_email_address;
  const emailType = getType(email);
  if (emailType === 'array' || emailType === 'object') email = email[0];
  if (isValidValue(email)) userData.em = makeString(email);

  let phone =
    userDataFrom.phone_number ||
    userDataFrom.phone ||
    userDataFrom.ph ||
    userDataFrom.sha256_phone_number;
  const phoneType = getType(phone);
  if (phoneType === 'array' || phoneType === 'object') phone = phone[0];
  if (isValidValue(phone)) userData.ph = makeString(phone);

  return userData;
}

function getStoredUserData() {
  if (!localStorage) return {};

  const storedUserData = localStorage.getItem(USER_DATA_STORAGE_KEY);
  if (!storedUserData) return {};

  const storedUserDataParsed = JSON.parse(storedUserData);
  if (getType(storedUserDataParsed) !== 'object') return {};

  const userData = {};
  if (isHashed(storedUserDataParsed.em)) userData.em = storedUserDataParsed.em;
  if (isHashed(storedUserDataParsed.ph)) userData.ph = storedUserDataParsed.ph;
  return userData;
}

function storeUserData(userData) {
  if (!localStorage) return;

  // Only hashed values are stored.
  const normalizedUserData = {};
  if (userData.em) normalizedUserData.em = normalizeEmail(userData.em);
  if (userData.ph) normalizedUserData.ph = normalizePhone(userData.ph);

  hashUserData(normalizedUserData, (hashedUserData) => {
    if (!hashedUserData.em && !hashedUserData.ph) return;
    localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify(hashedUserData));
  });
}

function hashUserData(userData, onDone) {
  const hashedUserData = {};
  const keysToHash = [];

  Object.keys(userData).forEach((key) => {
    const value = userData[key];
    if (!value) return;
    if (isHashed(value)) hashedUserData[key] = makeString(value).toLowerCase();
    else keysToHash.push(key);
  });

  let pendingHashes = keysToHash.length;
  if (pendingHashes === 0) return onDone(hashedUserData);

  keysToHash.forEach((key) => {
    sha256(
      userData[key],
      (digest) => {
        hashedUserData[key] = digest;
        if (--pendingHashes === 0) onDone(hashedUserData);
      },
      () => {
        if (--pendingHashes === 0) onDone(hashedUserData);
      },
      { outputEncoding: 'hex' }
    );
  });
}

function getConsentState(data) {
  if (data.enableGoogleConsentMode) {
    return isConsentGranted('ad_storage') ? 'granted' : 'denied';
  }
  return normalizeConsentValue(data.adStorageConsent);
}

function normalizeConsentValue(value) {
  if ([true, 'true', 'granted', 1, '1'].indexOf(value) !== -1) return 'granted';
  if ([false, 'false', 'denied', 0, '0'].indexOf(value) !== -1) return 'denied';
}

function sendConsentState(queueName, consentState) {
  if (!consentState) return;

  const lastConsentStateKey = 'uet_consent_state_' + queueName;
  const lastConsentState = templateStorage.getItem(lastConsentStateKey);
  if (lastConsentState === consentState) return;
  templateStorage.setItem(lastConsentStateKey, consentState);

  // The first consent signal on the page is the default state. Subsequent changes are updates.
  uetPush(queueName, 'consent', lastConsentState ? 'update' : 'default', {
    ad_storage: consentState
  });
}

function addGoogleConsentModeListener(queueName) {
  const listenerAddedKey = 'uet_consent_listener_added_' + queueName;
  if (templateStorage.getItem(listenerAddedKey)) return;
  templateStorage.setItem(listenerAddedKey, true);

  addConsentListener('ad_storage', (consentType, granted) => {
    if (consentType !== 'ad_storage') return;
    sendConsentState(queueName, granted ? 'granted' : 'denied');
  });
}

function runOnAdStorageGranted(queueName, callback) {
  const callbacksKey = 'uet_consent_callbacks_' + queueName;
  const queuedCallbacks = templateStorage.getItem(callbacksKey) || [];
  queuedCallbacks.push(callback);
  templateStorage.setItem(callbacksKey, queuedCallbacks);

  const listenerAddedKey = 'uet_basic_consent_listener_added_' + queueName;
  if (templateStorage.getItem(listenerAddedKey)) return;
  templateStorage.setItem(listenerAddedKey, true);

  addConsentListener('ad_storage', (consentType, granted) => {
    if (consentType !== 'ad_storage' || !granted) return;
    const callbacks = templateStorage.getItem(callbacksKey) || [];
    templateStorage.setItem(callbacksKey, []);
    callbacks.forEach((cb) => cb());
  });
}

function enableTcfOnce(queueName) {
  const tcfEnabledKey = 'uet_tcf_enabled_' + queueName;
  if (templateStorage.getItem(tcfEnabledKey)) return;
  templateStorage.setItem(tcfEnabledKey, true);
  uetPush(queueName, 'config', 'tcf', { enabled: true });
}

function pushEventIdToDataLayer(data) {
  if (!data.pushEventIdToDataLayer) return;

  const dataLayerPush = createQueue(data.eventIdDataLayerVariableName || 'dataLayer');
  dataLayerPush({
    eventId: data.eventId,
    event: data.eventIdDataLayerEventName || 'microsoftUetPixelDataLayerPush'
  });
}

// UET_push(queueName, ...args) is exposed by bat.js. The number of arguments matters to UET.
function uetPush(queueName, command, arg1, arg2) {
  if (arg1 === undefined) return callInWindow('UET_push', queueName, command);
  if (arg2 === undefined) return callInWindow('UET_push', queueName, command, arg1);
  return callInWindow('UET_push', queueName, command, arg1, arg2);
}

/*==============================================================================
  Helpers
==============================================================================*/

function isUIFieldTrue(field) {
  return [true, 'true', 1, '1'].indexOf(field) !== -1;
}

function isValidValue(value) {
  const valueType = getType(value);
  if (valueType === 'null' || valueType === 'undefined' || value !== value) return false;
  return value !== '' && value !== 'undefined' && value !== 'null';
}

function assign(target, source) {
  if (!source) return target;
  Object.keys(source).forEach((key) => {
    target[key] = source[key];
  });
  return target;
}

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

// Same normalization applied by bat.js before hashing.
function normalizeEmail(email) {
  if (!email) return;
  const value = makeString(email).trim().toLowerCase();
  if (isHashed(value)) return value;

  const emailParts = value.split('@');
  if (emailParts.length !== 2) return value;
  const localPart = emailParts[0].split('+')[0].split('.').join('');
  return localPart + '@' + emailParts[1];
}

function normalizePhone(phone) {
  if (!phone) return;
  let value = makeString(phone).trim();
  if (isHashed(value)) return value.toLowerCase();

  [' ', '\t', '-', '(', ')'].forEach((char) => {
    value = value.split(char).join('');
  });
  if (value.charAt(0) !== '+') value = '+' + value;
  return value;
}

function copyFromDataLayerWithVersion(key) {
  const dataLayerVersion = data.enableMostRecentDataLayerEventOnly ? 1 : 2;
  return copyFromDataLayer(key, dataLayerVersion);
}
