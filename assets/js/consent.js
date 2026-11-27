// Consent banner: opt-in, nothing non-essential before a choice. The choice is the one first-party cookie
// decuma_consent (category states, registry version, date; 6 months). The footer link reopens the banner with details.
// Gate: a non-essential script is never in the HTML; it is listed in the registry (data/consent.yaml, carried on the bar)
// and injected here only while its category is granted. Revoking a category whose script ran reloads the page.
;(function () {
  var bar = document.querySelector('[data-consent]')
  if (!bar) return
  var NAME = 'decuma_consent'
  var VERSION = Number(bar.dataset.version) // registry version: a changed registry asks again
  var SCRIPTS = JSON.parse(bar.dataset.scripts || '[]')
  var geladen = {} // categories whose scripts ran on this page
  function laden(w) {
    SCRIPTS.forEach(function (s) {
      if (!w[s.category] || document.querySelector('script[src="' + s.src + '"]')) return
      var e = document.createElement('script')
      e.src = s.src
      document.head.appendChild(e)
      geladen[s.category] = true
    })
  }
  function lesen() {
    var m = document.cookie.match(/(?:^|; )decuma_consent=([^;]*)/)
    if (!m) return null
    try {
      var w = JSON.parse(decodeURIComponent(m[1]))
      return w.v === VERSION ? w : null
    } catch (e) {
      return null
    }
  }
  var statistik = bar.querySelector('input[name=statistik]')
  function details(an) {
    bar.querySelectorAll('[data-details]').forEach(function (e) { e.hidden = !an })
    bar.querySelectorAll('[data-short]').forEach(function (e) { e.hidden = an })
    bar.querySelector('[data-more]').setAttribute('aria-expanded', String(an))
  }
  function zeigen(mitDetails) {
    var w = lesen()
    statistik.checked = !!(w && w.statistik)
    details(mitDetails)
    bar.hidden = false
  }
  function speichern(an) {
    var w = { v: VERSION, statistik: an, am: new Date().toISOString().slice(0, 10) }
    document.cookie = NAME + '=' + encodeURIComponent(JSON.stringify(w)) + '; Max-Age=' + 183 * 24 * 3600 + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '')
    bar.hidden = true
    details(false)
    document.dispatchEvent(new CustomEvent('decuma:consent', { detail: w }))
    if (Object.keys(geladen).some(function (k) { return !w[k] })) location.reload()
    else laden(w)
  }
  bar.querySelectorAll('[data-choice]').forEach(function (b) {
    b.addEventListener('click', function () { speichern(b.dataset.choice === '1') })
  })
  bar.querySelector('[data-more]').addEventListener('click', function () {
    details(true)
    statistik.focus() // the pressed button is gone; focus goes to the first choice
  })
  bar.querySelector('[data-save]').addEventListener('click', function () { speichern(statistik.checked) })
  document.querySelectorAll('[data-consent-open]').forEach(function (b) {
    b.addEventListener('click', function () { zeigen(true) })
  })
  var w = lesen()
  if (w) laden(w)
  else zeigen(false)
})()
