// A work sequence of a product page (the prototype's Ablauf.svelte and KiChat.svelte): its markup before it plays, then
// one <template data-nach="<ms>"> per step, each holding the whole element at that step. Played once when a third of it
// is in view, at the prototype's timings, then it stops; reduced motion shows the last step at once.
;(function () {
  if (!window.einmal) return
  document.querySelectorAll('[data-folge]').forEach(function (el) {
    var steps = []
    for (var t = el.nextElementSibling; t && t.matches('template[data-nach]'); t = t.nextElementSibling) steps.push(t)
    var zu = function (t) {
      var neu = t.content.firstElementChild
      for (var i = 0; i < neu.attributes.length; i++) el.setAttribute(neu.attributes[i].name, neu.attributes[i].value)
      el.innerHTML = neu.innerHTML
    }
    window.einmal(el, function () {
      if (!steps.length) return
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return zu(steps[steps.length - 1])
      var i = 0
      var weiter = function () {
        zu(steps[i++])
        if (i < steps.length) setTimeout(weiter, Number(steps[i].dataset.nach))
      }
      setTimeout(weiter, Number(steps[0].dataset.nach))
    })
  })
})()
