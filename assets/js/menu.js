// Mega-menus and the mobile sheet, as the prototype's shell: one wrapper holds the triggers and the open panel; a menu
// opens on pointer enter (never on touch), stays open while the pointer is anywhere in the wrapper and closes 150 ms
// after it left (re-entering cancels); Escape closes and returns focus to the trigger; a press outside, focus leaving
// the wrapper and a click on a menu link close it; a click toggles only for keyboard activation or without hover;
// Preise on pointer enter closes an open menu; the scrim closes on click.
;(function () {
  var huelle = document.querySelector('[data-menu]')
  if (!huelle) return
  var scrim = document.querySelector('[data-scrim]')
  var burger = document.querySelector('[data-burger]')
  var sheet = document.getElementById('w-sheet')
  var triggers = {}
  huelle.querySelectorAll('[data-trigger]').forEach(function (b) { triggers[b.dataset.trigger] = b })
  var offen = null
  var zu

  function setzen(m) {
    offen = m
    Object.keys(triggers).forEach(function (k) {
      triggers[k].setAttribute('aria-expanded', String(k === m))
      document.getElementById('menu-' + k).hidden = k !== m
    })
    scrim.hidden = !m
  }
  function schliessen(fokus) {
    clearTimeout(zu)
    var m = offen
    setzen(null)
    if (fokus && m) triggers[m].focus()
  }
  function icon(btn, an) {
    var d = btn.dataset.d.split('|')
    btn.querySelector('path').setAttribute('d', d[an ? 1 : 0])
  }
  function mobil(an) {
    burger.setAttribute('aria-expanded', String(an))
    if (an) burger.setAttribute('aria-label', burger.dataset.labelZu)
    else burger.removeAttribute('aria-label')
    icon(burger, an)
    sheet.hidden = !an
  }

  huelle.addEventListener('pointerenter', function (e) {
    if (e.pointerType !== 'touch') clearTimeout(zu)
  })
  huelle.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'touch') return
    clearTimeout(zu)
    zu = setTimeout(function () { setzen(null) }, 150)
  })
  huelle.addEventListener('focusout', function (e) {
    if (offen && !huelle.contains(e.relatedTarget)) schliessen()
  })
  Object.keys(triggers).forEach(function (k) {
    var b = triggers[k]
    b.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch') return
      clearTimeout(zu)
      setzen(k)
    })
    b.addEventListener('click', function (e) {
      setzen(e.detail === 0 || !matchMedia('(hover: hover)').matches ? (offen === k ? null : k) : k)
    })
    document.getElementById('menu-' + k).addEventListener('click', function (e) {
      if (e.target.closest('a')) schliessen()
    })
  })
  huelle.querySelector('[data-preise]').addEventListener('pointerenter', function () {
    if (offen) schliessen()
  })
  scrim.addEventListener('click', function () { schliessen() })
  window.addEventListener('pointerdown', function (e) {
    if (offen && !huelle.contains(e.target)) schliessen()
  })
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return
    if (offen) schliessen(true)
    else if (!sheet.hidden) mobil(false)
  })

  burger.addEventListener('click', function () { mobil(sheet.hidden) })
  sheet.querySelectorAll('[data-accordion]').forEach(function (b) {
    b.addEventListener('click', function () {
      var auf = b.getAttribute('aria-expanded') !== 'true'
      sheet.querySelectorAll('[data-accordion]').forEach(function (x) {
        var an = auf && x === b
        x.setAttribute('aria-expanded', String(an))
        icon(x, an)
        document.getElementById(x.getAttribute('aria-controls')).hidden = !an
      })
    })
  })
})()
