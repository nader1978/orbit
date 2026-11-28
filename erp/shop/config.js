/* ORBIT online shop — settings for this website
   api:    leave empty. The shop reads products from data/ (ORBIT pushes it to GitHub), and when ORBIT is switched
           to "Connected" the catalogue carries the connection address (ORBIT shop gateway or Power Automate flow),
           so orders go straight into SharePoint. Until then customers send their order by WhatsApp / e-mail.
           Fill in api only if you host the shop without the data/ folder.
   thumbs: true = product lists use the small pictures ORBIT makes (t-… files) — faster on phones. */
window.SHOP_CONFIG = {
  api: '',
  data: 'data/',
  demo: '',          /* no demo products on the live shop */
  thumbs: true
};
