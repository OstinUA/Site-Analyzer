export const DEFAULTS = {
  concurrencyLimit: 5,
  timeoutMs: 15000,
  titleMaxLength: 40,
  themeStorageKey: 'siteAnalyzerTheme'
};

export const PARKING_TITLE_PATTERNS = [
  /parking/i, /domain for sale/i, /buy this domain/i, /domain sale/i,
  /this domain/i, /under construction/i, /coming soon/i, /website coming/i,
  /parked domain/i, /sedoparking/i, /hugedomains/i, /afternic/i, /dan\.com/i,
  /namejet/i, /sedo\.com/i, /domain available/i, /this web page is parked/i,
  /this domain may be for sale/i
];

export const PARKING_BODY_PATTERNS = [
  /domain for sale/i, /buy this domain/i, /hugedomains\.com/i,
  /sedoparking\.com/i, /afternic\.com/i, /dan\.com/i, /parking/i,
  /this domain is parked/i, /domain may be for sale/i,
  /related links/i, /sponsored links/i, /this web page is parked/i,
  /click here to buy now/i, /make an offer/i
];

export const PARKING_DOMAINS = [
  'sedoparking.com', 'hugedomains.com', 'afternic.com', 'dan.com', 'namejet.com',
  'sedo.com', 'godaddy.com', 'namecheap.com', 'uniregistry.com', 'bodis.com',
  'parkingcrew.com', 'above.com', 'buydomains.com', 'squadhelp.com', 'undeveloped.com',
  'efty.com', 'flippa.com', 'brandpa.com', 'domainagents.com', 'domcop.com',
  'domainnamesoup.com', 'parked.com', 'parklogic.com', 'skenzo.com'
];

export const CMS_MARKERS = {
  WordPress: /wp-content|wp-includes|\/themes\//i,
  Drupal: /drupal|sites\/default\/files/i,
  Joomla: /joomla|\/components\/com_/i,
  Wix: /wix\.com|wixsite\.com|wixstatic\.com/i,
  Webflow: /webflow\.com|\.webflow\./i,
  Shopify: /shopify|myshopify/i,
  Squarespace: /squarespace\.com/i,
  PrestaShop: /prestashop/i,
  Magento: /magento/i,
  OpenCart: /opencart/i,
  Bitrix: /bitrix|1c-bitrix/i,
  Tilda: /tilda\.ws|tildacdn/i,
  Bootstrap: /bootstrap\.min\.css|bootstrap\.css/i,
  React: /react\.js|react-dom|_next\/static|next\.config/i,
  Vue: /vue\.js|nuxt/i,
  Angular: /ng-app|angular\.js|ng-version/i
};
