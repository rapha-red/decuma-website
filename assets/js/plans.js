// Billing toggle of the plan cards: both states are in the markup; a press shows one and hides the other.
document.querySelectorAll('[data-plans]').forEach(function (box) {
  box.querySelectorAll('[data-billing]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('data-billing')
      box.querySelectorAll('[data-billing]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)) })
      box.querySelectorAll('[data-billing-show]').forEach(function (x) { x.hidden = x.getAttribute('data-billing-show') !== on })
    })
  })
})
