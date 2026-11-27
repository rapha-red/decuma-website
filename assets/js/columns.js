// Comparison tables on phones: the segmented control above a table picks the one column shown next to the row names
// (CSS hides the cells marked .aus below 760 px). Without this script the control stays hidden and every column shows
// in a scroll box. Starts on the highlighted column, as the prototype does.
document.querySelectorAll('[data-pick]').forEach(function (pick) {
  var box = pick.nextElementSibling
  var buttons = pick.querySelectorAll('button')
  function show(n) {
    buttons.forEach(function (b, i) { b.setAttribute('aria-pressed', String(i === n)) })
    box.querySelectorAll('tr').forEach(function (tr) {
      if (tr.children.length < 2) return // a group heading
      for (var i = 1; i < tr.children.length; i++) tr.children[i].classList.toggle('aus', i - 1 !== n)
    })
  }
  var start = 0
  buttons.forEach(function (b, i) {
    if (b.getAttribute('aria-pressed') === 'true') start = i
    b.addEventListener('click', function () { show(i) })
  })
  show(start)
  box.setAttribute('data-picked', '')
  pick.hidden = false
})
