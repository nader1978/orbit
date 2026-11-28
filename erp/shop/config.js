/* ORBIT online shop — settings for this website
   api:    the address of your Power Automate flow ("When an HTTP request is received" → HTTP POST URL).
           Empty = NOT CONNECTED: the shop reads products from the data/ folder (ORBIT → Online Shop →
           Website connection → 📦 Download website files) and customers send their order by WhatsApp / e-mail.
           If there is no data/ folder either, the shop shows the demo products.
   thumbs: true = product lists use the small pictures ORBIT makes (t-… files) — faster on phones. */
window.SHOP_CONFIG = {
  api: '',
  data: 'data/',
  demo: 'demo/',
  thumbs: true
};
