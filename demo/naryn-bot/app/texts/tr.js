// Botun tüm Türkçe metinleri (ru.js ile aynı anahtarlar).
// Kelime listeleri ve kalıplar normalize edilmiş metinle karşılaştırılır: ç→c, ş→s, ğ→g, ı/İ→i, ö→o, ü→u.
// Bu yüzden listelerde Türkçe harf kullanılabilir, ama intents içindeki regex'ler harfsiz yazılır.

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const WD = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const MEDIA = { image: 'fotoğraf', audio: 'sesli mesaj', voice: 'sesli mesaj', video: 'video', document: 'dosya', sticker: 'çıkartma', contacts: 'kişi kartı' }

const dateFmt = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}, ${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`
}
const guests = (n) => `${n} kişi`
const lines = (...rows) =>
  rows
    .filter((r) => r !== null && r !== undefined && r !== false)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export default {
  dateFmt,
  guests,

  words: {
    menu: ['menü', 'menu', 'menüyü göster', 'menüyü görebilir miyim'],
    home: [
      'başla', 'başlat', 'ana menü', 'geri', '0', 'merhaba', 'merhabalar', 'selam', 'selamlar', 'selamün aleyküm', 'selamun aleykum',
      'iyi günler', 'iyi akşamlar', 'günaydın', 'hi', 'hello', 'start',
    ],
    cancel: ['iptal', 'vazgeç', 'dur', 'cancel'],
    cart: ['sepet', 'sepetim'],
    yes: ['evet', 'tamam', 'onaylıyorum', 'onayla', 'doğru', 'ok', 'olur'],
    exitHandoff: ['menü', 'menu', 'bot', 'başla', 'ana menü', 'start'],
    admin: ['admin', 'yönetici'],
    asCustomer: ['müşteri', 'misafir', 'test'],
    ownerOrders: ['siparişler'],
    ownerBookings: ['rezervasyonlar'],
    stop: [
      'ne', 'kadar', 'fiyatı', 'fiyat', 'var', 'mı', 'mi', 'mu', 'istiyorum', 'alabilir', 'miyim', 'bir', 'iki', 'üç', 'tane', 'adet',
      'lütfen', 'bana', 'sizde', 'için', 'ile', 've', 'veya', 'nasıl', 'nedir', 'kaç', 'bu', 'şu', 'merhaba', 'selam', 'porsiyon', 'olsun',
      'acaba', 'bakabilir', 'göster', 'söyler', 'misiniz',
    ],
  },

  // [regex over normalised text, intent]
  intents: [
    [/(yetkili|gorevli|yonetici ile|canli destek|insanla|biriyle gorus|beni arayin|beni ara|personel)/, 'human'],
    [/(adres|neredesiniz|nerdesiniz|konum|nasil gel|calisma saat|kacta acil|kacta kapan|acik misiniz|aciksiniz|telefon|numara|sube)/, 'info'],
    [/(rezervasyon|rezerve|masa ayir|yer ayir)/, 'book'],
    [/(siparis|paket|eve servis|teslimat|getirir|gel al)/, 'order'],
    [/(menu|fiyat|ne var|yemek|ne kadar)/, 'menu'],
    [/(tesekkur|sag ol|sagol|eyvallah)/, 'thanks'],
    [/(merhaba|selam|iyi gunler|iyi aksamlar|gunaydin|hello|^hi$)/, 'greet'],
  ],

  // ───── ana menü ─────
  welcome: (name, cafe) =>
    `Merhaba${name ? ` ${name}` : ''}! 👋\nBen *${cafe.name}* asistanıyım.\n\nMenüyü fiyatlarıyla gösterebilir, siparişinizi alabilir ve masa ayırabilirim. «Seç» butonuna dokunun 👇`,
  whatNext: 'Başka nasıl yardımcı olabilirim? «Seç» butonuna dokunun 👇',
  home: {
    menu: '📖 Menü ve sipariş',
    menuDesc: (n) => `${n} ürün, fiyatlarıyla; birkaç dokunuşla sipariş`,
    cart: '🧺 Sepet',
    cartDesc: (n, sum) => `${n} ürün · ${sum}`,
    book: '📅 Masa rezervasyonu',
    bookDesc: 'Tarih, saat ve yer bir dakikada',
    info: '📍 Adres ve saatler',
    openNow: '🟢 Şu an açık',
    closedNow: '🔴 Şu an kapalı',
    human: '👤 Yetkili',
    humanDesc: 'Bir çalışanımıza soru sorun',
  },

  btn: {
    homeList: 'Seç',
    sections: 'Kategoriler',
    dishes: 'Ürünler',
    choose: 'Seç',
    menu: '📖 Menü',
    home: '🏠 Ana menü',
    book: '📅 Rezervasyon',
    info: '📍 Adres',
    back: '◀ Geri',
    toCart: '➕ Sepete ekle',
    cart: '🧺 Sepet',
    cartN: (n) => `🧺 Sepet (${n})`,
    more: '📖 Ürün ekle',
    checkout: '✅ Siparişi ver',
    edit: '✏️ Düzenle',
    delivery: '🚗 Adrese teslim',
    pickup: '🏃 Gel-al',
    asap: 'En kısa sürede',
    in30: '30 dakika sonra',
    in60: '1 saat sonra',
    confirm: '✅ Onayla',
    comment: '💬 Not ekle',
    cancel: '❌ İptal',
    bookOk: '✅ Rezerve et',
    wish: '💬 İstek ekle',
    accept: '✅ Kabul et',
    reject: '❌ Reddet',
    ready: '🍽 Sipariş hazır',
    sentOut: '🚗 Kuryeye verildi',
    approve: '✅ Onayla',
    noSeats: '❌ Yer yok',
    returnBot: '🤖 Botu aç',
    openMap: 'Haritada aç',
    otherTime: '📅 Başka saat',
    human: '👤 Yetkili',
  },

  // ───── menü ─────
  menuIntro: '📖 *Menü*\nBir kategori seçin, ürünleri ve fiyatları göstereyim. Sipariş için ürünü açıp «Sepete ekle»ye dokunun.',
  sectionsTitle: 'Menü kategorileri',
  menuFooter: 'Ürün adını da yazabilirsiniz',
  catDesc: (n, min) => `${n} ürün · ${min} ve üzeri`,
  catIntro: (title) => `*${title}*\nBir ürün seçin, açıklamasını ve fiyatını göstereyim.`,
  priceFrom: (p) => `${p} ve üzeri`,
  prevPage: '◀ Geri',
  nextPage: 'Devamı ▶',
  pageOf: (p, n) => `sayfa ${p} / ${n}`,
  chooseVariant: 'Bir seçenek seçin 👇',
  found: (n) => (n > 9 ? `${n} ürün buldum, ilk 9'u 👇` : 'Menüde bunları buldum 👇'),
  foundTitle: 'Bulunanlar',
  fullMenu: '📖 Tüm menü',
  fullMenuDesc: (n) => `${n} ürünün hepsi, kategorilere göre`,

  // ───── sepet ─────
  askQty: (name) => `Kaç adet «${name}» ekleyeyim?`,
  qtyFooter: 'Ya da sayıyı yazın',
  badQty: (max) => `Adedi rakamla yazın: 1 ile ${max} arası.`,
  added: (name, n, count, total) => `✅ Eklendi: ${name} × ${n}\n🧺 Sepette ${count} ürün, toplam ${total}`,
  cart: (items, total) => `🧺 *Sepetiniz*\n\n${items}\n\n*Toplam: ${total}*`,
  cartEmpty: '🧺 Sepetiniz şu an boş. Menüyü açıp ürün ekleyin.',
  cartCleared: '🗑 Sepet boşaltıldı.',
  editIntro: 'Bir porsiyon çıkarmak için ürüne dokunun.',
  cartTitle: 'Sepette',
  rmDesc: (q, sum) => `${q} adet · ${sum} · 1 çıkar`,
  clearCart: '🗑 Sepeti boşalt',
  clearCartDesc: 'Hepsini çıkar',
  removed: (name) => `➖ Bir porsiyon çıkarıldı: ${name}`,
  andMore: (n) => `…ve ${n} ürün daha`,

  // ───── sipariş ─────
  ordersOff: (phones) => `Şu an bot üzerinden sipariş almıyoruz. Lütfen bizi arayın: ${phones}`,
  askShip: (note) => `Siparişinizi nasıl almak istersiniz?${note ? `\n\nℹ️ ${note}` : ''}`,
  askAddress: '🚗 Nereye getirelim? Adresi yazın: mahalle, sokak, bina ve daire no.\n\nYa da aşağıdaki butona dokunup konumunuzu gönderin.',
  addrTooShort: 'Adres çok kısa. Sokak ve bina numarasını yazın, örneğin: Atatürk Cad. No 12 D 4.',
  geoAddress: 'Konum',
  askBranchPickup: '🏃 Hangi şubeden alacaksınız?',
  askBranchBook: '📅 Hangi şubede masa ayıralım?',
  branchLine: (b) => `📍 *${b.title}*${b.place ? ` (${b.place})` : ''} · ${b.open}–${b.close}`,
  branchDesc: (b) => `${b.place ? `${b.place} · ` : ''}${b.open}–${b.close}`,
  branchesTitle: 'Şubeler',
  askPickupTime: '⏰ Ne zaman alacaksınız?',
  timeFooter: 'Ya da saati yazın, örneğin 19:30',
  asap: 'en kısa sürede',
  byTime: (t) => `saat ${t}`,
  askPay: '💳 Nasıl ödeyeceksiniz?',
  payTitle: 'Ödeme',
  askName: 'Adınız nedir? Yetkilimiz size nasıl hitap edeceğini bilsin.',
  closedNow: (open) => `⚠️ Şu an kapalıyız (açılış: ${open}). Siparişinizi alıyoruz, yetkilimiz açılışta onaylayacak.`,
  minDelivery: (min, diff) => `Adrese teslim için minimum tutar ${min}. ${diff} daha ürün ekleyin ya da gel-al seçin.`,
  orderSummary: (o) =>
    lines(
      '📝 *Siparişinizi kontrol edin*',
      '',
      o.items,
      '',
      `*Toplam: ${o.total}*`,
      '',
      o.ship === 'delivery' ? `🚗 Teslimat: ${o.address}` : `🏃 Gel-al: ${o.branch?.title || ''}${o.when ? `, ${o.when}` : ''}`,
      o.pay && `💳 Ödeme: ${o.pay}`,
      `👤 ${o.name}, ${o.phone}`,
      o.comment && `💬 ${o.comment}`,
      o.deliveryNote && `ℹ️ ${o.deliveryNote}`,
      '',
      'Her şey doğru mu?',
    ),
  askComment: '💬 Siparişe notunuzu yazın: örneğin «soğansız» ya da «3 kişilik çatal bıçak».',
  orderCancelled: 'Sipariş iptal edildi. Ürünler sepette duruyor, istediğiniz zaman devam edebilirsiniz.',
  orderSent: (id) => `🎉 Sipariş #${id} işletmeye iletildi!\n\nYetkilimiz onayladığında size buradan yazacağım.`,
  orderAccepted: (o, b) =>
    o.ship === 'delivery'
      ? `✅ Sipariş #${o.id} onaylandı ve hazırlanıyor!\nKurye şu adrese getirecek: ${o.address}.`
      : `✅ Sipariş #${o.id} onaylandı ve hazırlanıyor!\nTeslim alma: ${b?.title || ''}${o.when ? `, ${o.when}` : ''}.`,
  orderRejected: (id, phones) => `😔 Üzgünüz, sipariş #${id} şu an alınamıyor. Lütfen bizi arayın: ${phones}`,
  orderReady: (id, b) => `🍽 Sipariş #${id} hazır! Sizi bekliyoruz${b ? `: ${b.title}` : ''}.`,
  orderOnTheWay: (id) => `🚗 Sipariş #${id} kuryeye verildi, yola çıktı!`,

  // ───── rezervasyon ─────
  bookingOff: (phones) => `Şu an bot üzerinden rezervasyon almıyoruz. Lütfen bizi arayın: ${phones}`,
  askDate: '📅 Hangi gün için rezervasyon yapalım?',
  dateFooter: 'Ya da tarihi yazın, örneğin 28.11',
  dayBtn: (n, iso) => ['Bugün', 'Yarın', 'Öbür gün'][n] || dateFmt(iso),
  badDate: 'Tarihi anlayamadım 🙂 Örneğin şöyle yazın: 28.11 ya da «yarın».',
  pastDate: 'Bu tarih geçti. Başka bir tarih yazın, örneğin 28.11.',
  tooFar: (d) => `En fazla ${d} gün sonrası için rezervasyon alıyoruz. Daha yakın bir tarih seçin.`,
  todayTooLate: 'Bugün için artık rezervasyon almıyoruz, başka bir gün seçin.',
  askTime: (open, last) => `⏰ Saat kaçta bekleyelim?\nRezervasyon saatleri: ${open}–${last}.`,
  badTime: 'Saati anlayamadım 🙂 Örneğin şöyle yazın: 19:30.',
  outsideHours: (open, last) => `Bu saate rezervasyon alamıyoruz. ${open}–${last} arasında bir saat seçin.`,
  timePassed: 'Bu saat geçti ya da çok yakın. En az 15 dakika sonrası için bir saat seçin.',
  askGuests: '👥 Kaç kişi olacaksınız?',
  guestsFooter: 'Ya da sayıyı yazın',
  badGuests: 'Kişi sayısını rakamla yazın, örneğin 5.',
  bigGroup: (max, phones) => `${max} kişiden kalabalık gruplar için telefonla görüşelim: ${phones}`,
  askSeat: '🪑 Nerede oturmak istersiniz?',
  seatsTitle: 'Yerler',
  anySeat: 'Fark etmez',
  seatFooter: 'Ya da isteğinizi yazın',
  askWish: '💬 İsteğinizi yazın: özel gün, çocuk sandalyesi, pasta vb.',
  bookSummary: (r) =>
    lines(
      '📅 *Rezervasyonu kontrol edin*',
      '',
      r.branch && `📍 ${r.branch.title}`,
      `🗓 ${r.date}, ${r.time}`,
      `👥 ${guests(r.guests)}`,
      r.seat && `🪑 ${r.seat}`,
      r.comment && `💬 ${r.comment}`,
      `👤 ${r.name}, ${r.phone}`,
      '',
      'Her şey doğru mu?',
    ),
  bookCancelled: 'Rezervasyon iptal edildi.',
  bookSent: (id) => `📨 Rezervasyon talebiniz (#${id}) iletildi! Yetkilimiz yer durumunu kontrol edip buradan onaylayacak.`,
  bookConfirmed: (id, b, date, time, n) =>
    lines(`✅ Rezervasyon #${id} onaylandı!`, b && `📍 ${b.title}`, `🗓 ${date}, ${time} · ${guests(n)}`, '', 'Sizi bekliyoruz! Planınız değişirse buraya yazmanız yeterli.'),
  bookRejected: (id) => `😔 Üzgünüz, #${id} numaralı rezervasyon için bu saatte yer yok. Başka bir saat seçebilir ya da yetkilimize sorabilirsiniz.`,

  // ───── adres, yetkili ─────
  branchInfo: (b, open) =>
    lines(
      `📍 *${b.title}*${b.place ? ` — ${b.place}` : ''}`,
      `🕘 Her gün ${b.open}–${b.close} · ${open ? 'şu an açık' : 'şu an kapalı'}`,
      b.phone && `📞 ${b.phone}`,
      b.instagram && `📷 ${b.instagram}`,
    ),
  callUs: (phones) => `Lütfen bizi arayın: ${phones}`,
  handoffStarted: (phones) =>
    `👤 Yetkilimize haber verdim. Sorunuzu yazın, cevap buraya gelecek.\n\nAcil ise arayın: ${phones}\nBota dönmek için «menü» yazın.`,
  fromAdmin: (text, first) =>
    `👤 *Yetkili:*\n${text}${first ? '\n\n_Buradan cevap verebilirsiniz, yetkilimiz görecek. Bota dönmek için: «menü»._' : ''}`,
  botBack: '🤖 Yetkilimiz sohbeti bitirdi. Ben tekrar buradayım, nasıl yardımcı olabilirim?',

  // ───── diğer ─────
  onlyText: 'Yazı ve butonları anlıyorum 🙂 Sesli mesaj ve fotoğrafı henüz anlayamıyorum; menüden seçin ya da yetkiliyi çağırın.',
  useButtons: 'Aşağıdaki butonlardan birini seçin 👇',
  cancelled: 'Tamam, iptal ettim.',
  nothingToCancel: 'İptal edilecek bir şey yok 🙂',
  expired: 'Bu menü artık geçerli değil. Baştan başlayalım 👇',
  oops: 'Bir şeyler ters gitti 😔 Baştan başlamak için «menü» yazın.',
  notUnderstood: 'Tam anlayamadım 🙂 Ürün adını yazabilir ya da bir seçenek seçebilirsiniz:',
  howToOrder: 'Sipariş için: bir kategori açın, ürünü seçin ve «Sepete ekle»ye dokunun. Sonra «Siparişi ver».',
  thanks: 'Rica ederiz! Sizi bekleriz 😊',
  locationThanks: 'Teşekkürler! Adrese teslim sipariş vermek isterseniz menüden ürünleri sepete ekleyin.',

  dateWords: {
    plus2: ['yarından sonra', 'öbür gün', 'ertesi gün'],
    plus1: ['yarın'],
    today: ['bugün', 'bu akşam', 'bu gece'],
    months: ['oca', 'şub', 'mar', 'nis', 'may', 'haz', 'tem', 'ağu', 'eyl', 'eki', 'kas', 'ara'],
  },
  shipWords: { delivery: /(teslim|adres|getir|eve)/, pickup: /(gel al|gelip al|kendim|ben alirim|alacagim)/ },

  sim: {
    guest: { name: 'Ayşe', phone: '905320000001' },
    owner: { name: 'Yönetici', phone: '905320000000' },
    hints: ['Merhaba', 'Menü', 'Masa ayırtmak istiyorum'],
    ui: {
      heading: 'WhatsApp botu',
      simTitle: 'bot simülatörü',
      desc: 'Solda kafenin misafiri, sağda yetkilinin telefonu. Butonlara WhatsApp’taki gibi dokunun. Misafire yetkili olarak cevap vermek için mesajdaki ↩ işaretine dokunun.',
      admin: 'Siparişler',
      reset: 'Baştan başla',
      tabGuest: 'Misafir',
      tabOwner: 'Yetkili',
      labelGuest: 'Misafir',
      labelOwner: 'Kafe yetkilisi',
      business: 'işletme hesabı',
      typing: 'yazıyor…',
      placeholder: 'Mesaj',
      send: 'Gönder',
      geo: 'Test konumu gönder',
      geoPoint: { latitude: 41.0369, longitude: 28.985, name: 'Test konumu', address: 'İstanbul' },
      sendLocation: '📍 Konum gönder',
      reply: 'Yanıtla',
      noReply: 'Yanıtlama',
      close: 'Kapat',
      openMap: 'Haritada aç',
      location: 'Konum',
      photo: 'Fotoğraf',
      geolocation: '📍 Konum',
      template: 'şablon',
      phones: 'Telefonlar',
      guestHint: 'Misafir, kafenin botunu WhatsApp’ta böyle görür. Bir mesaj yazın ya da önerilerden biriyle başlayın:',
      ownerHint: 'Yeni siparişler, rezervasyonlar ve misafir soruları yetkiliye buraya gelir. Komutları görmek için «merhaba» yazın.',
      locale: 'tr-TR',
    },
  },

  admin: {
    title: 'siparişler ve rezervasyonlar',
    sim: ' (simülatör)',
    refresh: 'Sayfa her 20 saniyede bir yenilenir.',
    snapshot: 'Sayfanın açıldığı andaki durum. Yeni siparişleri görmek için sayfayı tekrar açın.',
    orders: 'Siparişler',
    bookings: 'Rezervasyonlar',
    noOrders: 'Henüz sipariş yok.',
    noBookings: 'Henüz rezervasyon yok.',
    cols: { no: '#', guest: 'Misafir', items: 'Ürünler', sum: 'Tutar', receive: 'Teslim', status: 'Durum', when: 'Ne zaman', guests: 'Kişi', where: 'Nerede' },
    delivery: 'Teslimat',
    pickup: 'Gel-al',
    lang: 'tr',
  },

  demoPage: {
    title: (name) => `${name} — WhatsApp botu (demo)`,
    description: 'Menü, sipariş ve masa rezervasyonu doğrudan WhatsApp’ta. Açın ve kendiniz deneyin: solda misafir, sağda kafe yetkilisi.',
    note: 'Demo: bot doğrudan tarayıcıda çalışır, hiçbir mesaj gönderilmez. Gerçek WhatsApp’ta da her şey böyle görünür.',
    credits: 'Ürün fotoğrafları: Wikimedia Commons — yazarlar ve lisanslar',
    cropped: 'Fotoğraflar kırpıldı ve küçültüldü.',
  },

  status: {
    new: '⏳ yanıt bekliyor',
    accepted: '✅ kabul edildi',
    rejected: '❌ reddedildi',
    ready: '🍽 hazır',
    sent: '🚗 yolda',
    confirmed: '✅ onaylandı',
  },

  // ───── yetkiliye giden mesajlar ─────
  owner: {
    newEvent: 'yeni talep',
    replyHint: 'Kaydırıp yanıtlayın, metin misafire gider',
    noName: 'Misafir',
    newOrder: (o) =>
      lines(
        `🛒 *Yeni sipariş #${o.id}*`,
        '',
        o.items,
        '',
        `*Toplam: ${o.total}*`,
        '',
        o.ship === 'delivery' ? `🚗 Teslimat: ${o.address}` : `🏃 Gel-al: ${o.branch?.title || ''}${o.when ? `, ${o.when}` : ''}`,
        o.map && `📍 ${o.map}`,
        o.pay && `💳 ${o.pay}`,
        `👤 ${o.name || 'İsimsiz'}, ${o.phone}`,
        o.comment && `💬 ${o.comment}`,
      ),
    orderShort: (id, total, name) => `sipariş #${id}, ${total}${name ? `, ${name}` : ''}`,
    newBooking: (r) =>
      lines(
        `📅 *Yeni rezervasyon #${r.id}*`,
        '',
        r.branch && `📍 ${r.branch.title}`,
        `🗓 ${r.dateText}, ${r.timeText}`,
        `👥 ${guests(r.guests)}`,
        r.seat && `🪑 ${r.seat}`,
        r.comment && `💬 ${r.comment}`,
        `👤 ${r.name || 'İsimsiz'}, ${r.phone}`,
      ),
    bookShort: (id, date, time, n, name) => `rezervasyon #${id}: ${date}, ${time}, ${guests(n)}${name ? `, ${name}` : ''}`,
    wantsHuman: (name, phone) =>
      `👤 *Misafir yetkiliyle görüşmek istiyor*\n${name || 'İsimsiz'}, ${phone}\n\nMesajları buraya gelecek. Herhangi birini kaydırıp yanıtlayın, cevabınız misafire gider.`,
    humanShort: (name) => `misafir${name ? ` ${name}` : ''} yetkiliyle görüşmek istiyor`,
    msgShort: (name) => `misafirden mesaj${name ? ` (${name})` : ''}`,
    fwdText: (who, text) => `💬 *${who}:*\n${text}`,
    fwdMedia: (who, type) => `💬 *${who}* bir ${MEDIA[type] || 'dosya'} gönderdi. Bot bunu iletemiyor; yazıyla yazmasını isteyin ya da arayın.`,
    accepted: (id) => `✅ Sipariş #${id} kabul edildi, misafire bildirildi. Hazır olunca butona dokunun.`,
    rejected: (id) => `Sipariş #${id} reddedildi, misafire bildirildi.`,
    done: (id) => `👍 Tamam, sipariş #${id} için misafire haber verdim.`,
    bookOk: (id) => `✅ Rezervasyon #${id} onaylandı, misafire bildirildi.`,
    bookNo: (id) => `Rezervasyon #${id} reddedildi, misafire başka saat önerildi.`,
    orderNo: (id) => `Sipariş #${id}`,
    bookingNo: (id) => `Rezervasyon #${id}`,
    already: (what, status) => `${what} — zaten ${status}.`,
    notFound: (id) => `#${id} bulunamadı.`,
    chatEnded: (was) => (was ? '🤖 Sohbet bitti, bot misafire tekrar cevap veriyor.' : 'Bot bu misafire zaten cevap veriyor.'),
    relayFailed: (windowClosed, phone) =>
      windowClosed
        ? `⚠️ İletilemedi: misafir 24 saatten uzun süre önce yazmış, WhatsApp işletmenin ilk yazmasına izin vermiyor. Arayın: ${phone}`
        : `⚠️ Mesaj misafire (${phone}) gönderilemedi.`,
    onlyTextRelay: 'Misafire sadece yazı iletebiliyorum. Cevabınızı yazıyla gönderin.',
    cantRelay: 'Hangi misafire cevap vereceğimi anlayamadım. Sipariş, rezervasyon ya da misafir mesajını kaydırıp yanıtlayın.',
    asCustomer: '🧪 Misafir modu: bot artık size misafir gibi cevap veriyor. Geri dönmek için «admin» yazın.',
    backToAdmin: '🛠 Tekrar yönetici modundasınız.',
    help: (cafe) =>
      `🛠 Burası ${cafe} botu, siz yöneticisiniz.\n\nYeni siparişler, rezervasyonlar ve misafir soruları buraya gelir.\n• Misafire cevap — mesajını kaydırıp yanıtlayın\n• «siparişler» — bugünkü siparişler\n• «rezervasyonlar» — yaklaşan rezervasyonlar\n• «müşteri» — botu misafir gözüyle görün`,
    noOrdersToday: 'Bugün henüz sipariş yok.',
    ordersToday: (rows, n, sum) => `🛒 *Bugünkü siparişler: ${n}* (toplam ${sum})\n\n${rows.join('\n')}`,
    orderRow: (o, time, total, st) => `#${o.id} · ${time} · ${o.name || o.phone} · ${total} · ${st}`,
    noBookings: 'Yaklaşan rezervasyon yok.',
    bookingsList: (rows) => `📅 *Yaklaşan rezervasyonlar*\n\n${rows.join('\n')}`,
    bookingRow: (r, date, time, b, st) => `#${r.id} · ${date} ${time} · ${guests(r.guests)} · ${r.name || r.phone}${b ? ` · ${b.title}` : ''} · ${st}`,
  },
}
