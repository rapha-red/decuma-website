// Play once (the prototype's anim.ts einmal()): an illustration or product visual gets data-an the first time a third of
// it is visible; the CSS starts its animation from that mark. Under reduced motion the mark is set at once.
;(function () {
  function einmal(node, start) {
    var los = function () {
      node.setAttribute('data-an', '1')
      if (start) start()
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') return los()
    var io = new IntersectionObserver(
      function (e) {
        if (e.some(function (x) { return x.isIntersecting })) {
          io.disconnect()
          los()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(node)
  }
  window.einmal = einmal
  document.querySelectorAll('.w-anim, .w-z').forEach(function (n) { einmal(n) })
})()
