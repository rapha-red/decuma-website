// The start-page chat (the prototype's Chat.svelte): played once when a third of it is in view, six steps at the
// prototype's timings, then it stops. The markup of steps 1 to 6 waits in <template data-chat>. Reduced motion jumps
// to the last step at once.
;(function () {
  var app = document.querySelector('.chat-app')
  if (!app || !window.einmal) return
  var TAKT = [900, 1500, 1400, 1300, 1300, 1100]
  var zu = function (i) {
    app.innerHTML = document.querySelector('template[data-chat="' + i + '"]').innerHTML
    app.setAttribute('data-stufe', String(i))
  }
  window.einmal(app, function () {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return zu(6)
    var i = 0
    var weiter = function () {
      zu(++i)
      if (i < 6) setTimeout(weiter, TAKT[i])
    }
    setTimeout(weiter, TAKT[0])
  })
})()
