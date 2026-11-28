// The Knowledge Base search (the prototype's Kb.svelte) over the site's own Pagefind index: /pagefind/pagefind.js is
// loaded on the first focus of the form, nothing from another origin. Field and filters (area, topic, for whom) narrow
// the results; on the index they replace the area overview while a search or filter is active, on an area page they
// replace its article list. Also the "Seite kopieren" control of an article: copies the twin, fetched from this origin.
;(function () {
  document.querySelectorAll('[data-kb-kopieren]').forEach(function (b) {
    var text = b.querySelector('span')
    var was = text.textContent
    b.addEventListener('click', function () {
      fetch(b.dataset.kbKopieren)
        .then(function (r) { return r.text() })
        .then(function (md) { return navigator.clipboard.writeText(md) })
        .then(function () {
          text.textContent = b.dataset.kopiert
          setTimeout(function () { text.textContent = was }, 1500)
        })
    })
  })

  var form = document.querySelector('[data-kb-suche]')
  if (!form) return
  var scope = (form.className.match(/svelte-\w+/) || [''])[0]
  var feld = form.querySelector('input')
  var filter = form.querySelectorAll('select')
  var preset = filter[0].value
  var bereiche = document.querySelector('.kb-bereiche')
  var fuss = document.querySelector('.kb-fuss')
  var pf
  var lauf = 0
  function laden() {
    return pf || (pf = import('/pagefind/pagefind.js'))
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag)
    e.className = (cls ? cls + ' ' : '') + scope
    if (text != null) e.textContent = text
    return e
  }
  function zeigen(treffer) {
    document.querySelectorAll('[data-kb-out]').forEach(function (e) { e.remove() })
    if (!treffer) return
    var zahl = el('p', 'w-small kb-zahl', treffer.length === 1 ? form.dataset.eins : form.dataset.n.replace('{n}', treffer.length))
    zahl.setAttribute('aria-live', 'polite')
    var raus = [zahl]
    if (treffer.length) {
      var ul = el('ul', 'kb-treffer')
      treffer.forEach(function (d) {
        var li = el('li')
        var a = el('a', '', d.meta.title)
        a.href = d.url.replace(/\.html$/, '')
        li.append(a, el('span', 'w-small kb-bereich', (d.filters.area || [''])[0]), el('span', 'kb-zeile', d.meta.description || ''))
        ul.append(li)
      })
      raus.push(ul)
    } else raus.push(el('p', '', form.dataset.leer))
    raus.forEach(function (e) {
      e.setAttribute('data-kb-out', '')
      fuss.before(e)
    })
  }
  function suchen() {
    var mein = ++lauf
    var q = feld.value.trim()
    var f = {}
    filter.forEach(function (s) { if (s.value) f[s.dataset.filter] = s.value })
    var aktiv = q || filter[1].value || filter[2].value || filter[0].value !== preset
    if (bereiche && !aktiv) {
      zeigen(null)
      bereiche.hidden = false
      return
    }
    laden()
      .then(function (p) { return p.search(q || null, { filters: f }) })
      .then(function (r) { return Promise.all(r.results.map(function (x) { return x.data() })) })
      .then(function (treffer) {
        if (mein !== lauf) return
        if (bereiche) bereiche.hidden = true
        zeigen(treffer)
      })
  }
  form.addEventListener('focusin', laden, { once: true })
  feld.addEventListener('input', suchen)
  filter.forEach(function (s) { s.addEventListener('change', suchen) })
})()
