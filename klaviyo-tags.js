/**
 * =============================================
 * GTM TAGS — KLAVIYO CLIENT-SIDE EVENTS
 * =============================================
 *
 * Pré-requisito: o snippet do klaviyo.js deve estar instalado
 * via GTM em todas as páginas antes dessas tags dispararem.
 *
 * Cada arquivo abaixo corresponde a uma tag HTML personalizada
 * no GTM. O acionador de cada tag está indicado no cabeçalho.
 */

// =============================================
// TAG 1: Viewed Product
// Acionador: GA4 - view_item (Evento personalizado)
// =============================================
/*
<script>
  var items = {{DL - Items}};
  if (items && items.length > 0) {
    var item = items[0];
    klaviyo.track("Viewed Product", {
      "ProductName": item.item_name || "",
      "ProductID":   item.item_id   || "",
      "SKU":         item.item_id   || "",
      "Categories": [
        item.item_category,
        item.item_category2,
        item.item_category3
      ].filter(Boolean),
      "ImageURL": item.image_url || "",
      "URL":      window.location.href,
      "Brand":    item.item_brand || "",
      "Price":    item.price || 0
    });
  }
</script>
*/

// =============================================
// TAG 2: Added to Cart
// Acionador: GA4 - add_to_cart (Evento personalizado)
// =============================================
/*
<script>
  var items = {{DL - Items}};
  if (items && items.length > 0) {
    var addedItem = items[0];

    var cartItems = items.map(function(item) {
      return {
        "ProductID":   item.item_id   || "",
        "SKU":         item.item_id   || "",
        "ProductName": item.item_name || "",
        "Quantity":    item.quantity  || 1,
        "ItemPrice":   item.price     || 0,
        "RowTotal":    (item.price || 0) * (item.quantity || 1),
        "ProductURL":  window.location.href,
        "ImageURL":    item.image_url || "",
        "Categories": [
          item.item_category,
          item.item_category2,
          item.item_category3
        ].filter(Boolean)
      };
    });

    klaviyo.track("Added to Cart", {
      "$value":                {{DL - Value}} || 0,
      "AddedItemProductName":  addedItem.item_name || "",
      "AddedItemProductID":    addedItem.item_id   || "",
      "AddedItemSKU":          addedItem.item_id   || "",
      "AddedItemPrice":        addedItem.price     || 0,
      "AddedItemQuantity":     addedItem.quantity  || 1,
      "AddedItemCategories": [
        addedItem.item_category,
        addedItem.item_category2,
        addedItem.item_category3
      ].filter(Boolean),
      "AddedItemImageURL": addedItem.image_url || "",
      "AddedItemURL":      window.location.href,
      "ItemNames": items.map(function(i) { return i.item_name; }).filter(Boolean),
      "Items": cartItems
    });
  }
</script>
*/

// =============================================
// TAG 3: Started Checkout
// Acionador: GA4 - begin_checkout (Evento personalizado)
// =============================================
/*
<script>
  var items = {{DL - Items}};
  if (items && items.length > 0) {

    var cartItems = items.map(function(item) {
      return {
        "ProductID":   item.item_id   || "",
        "SKU":         item.item_id   || "",
        "ProductName": item.item_name || "",
        "Quantity":    item.quantity  || 1,
        "ItemPrice":   item.price     || 0,
        "RowTotal":    (item.price || 0) * (item.quantity || 1),
        "ProductURL":  window.location.href,
        "ImageURL":    item.image_url || "",
        "Categories": [
          item.item_category,
          item.item_category2,
          item.item_category3
        ].filter(Boolean)
      };
    });

    klaviyo.track("Started Checkout", {
      "$event_id": ({{DL - Transaction ID}} || Date.now()) + "_" + Date.now(),
      "$value":    {{DL - Value}} || 0,
      "ItemNames": items.map(function(i) { return i.item_name; }).filter(Boolean),
      "Categories": items.reduce(function(acc, item) {
        [item.item_category, item.item_category2, item.item_category3]
          .filter(Boolean)
          .forEach(function(cat) {
            if (acc.indexOf(cat) === -1) acc.push(cat);
          });
        return acc;
      }, []),
      "CheckoutURL": window.location.href,
      "Items": cartItems
    });
  }
</script>
*/

// =============================================
// TAG 4: Removed from Cart
// Acionador: GA4 - remove_from_cart (Evento personalizado)
// =============================================
/*
<script>
  var items = {{DL - Items}};
  if (items && items.length > 0) {
    var removedItem = items[0];

    klaviyo.track("Removed from Cart", {
      "$value":                  {{DL - Value}} || 0,
      "RemovedItemProductName":  removedItem.item_name || "",
      "RemovedItemProductID":    removedItem.item_id   || "",
      "RemovedItemSKU":          removedItem.item_id   || "",
      "RemovedItemPrice":        removedItem.price     || 0,
      "RemovedItemQuantity":     removedItem.quantity  || 1,
      "RemovedItemCategories": [
        removedItem.item_category,
        removedItem.item_category2,
        removedItem.item_category3
      ].filter(Boolean),
      "RemovedItemImageURL": removedItem.image_url || "",
      "RemovedItemURL":      window.location.href
    });
  }
</script>
*/

/**
 * =============================================
 * VARIÁVEIS NECESSÁRIAS NO GTM
 * =============================================
 *
 * Tipo: Variável da camada de dados (Versão 2)
 *
 * Nome              | dataLayer path
 * ------------------|------------------------
 * DL - Items        | ecommerce.items
 * DL - Value        | ecommerce.value
 * DL - Transaction ID | ecommerce.transaction_id
 * DL - Coupon       | ecommerce.coupon
 * DL - Currency     | ecommerce.currency
 * DL - User Email   | user_data.email_address
 * DL - User Phone   | user_data.phone_number
 *
 * =============================================
 * SNIPPET KLAVIYO.JS (instalado em todas as páginas)
 * =============================================
 *
 * Substitua PUBLIC_API_KEY pela chave pública de 6 caracteres
 * encontrada em: Klaviyo → Settings → API Keys
 *
 * <script async type="text/javascript"
 *   src="https://static.klaviyo.com/onsite/js/PUBLIC_API_KEY/klaviyo.js">
 * </script>
 * <script type="text/javascript">
 *   !function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];
 *   try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?
 *   function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:
 *   function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)
 *   o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,
 *   e=new Promise((function(n){window._klOnsite.push([i].concat(o,
 *   [function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){
 *   window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){
 *   var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();
 * </script>
 */
