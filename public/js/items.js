// Il s'agirait d'aller se faire foutre avec des fichiers qui s'appellent todo, j'arrivais pas à le trouver...

const submitForm = document.querySelector(".add");
const addButton = document.querySelector(".add-todo");
const itemList = document.querySelector(".todos");
const list = document.querySelectorAll(".todos li");
const hiddenAnswer = document.querySelector('#add-item-hidden');
let listLength = list.length;

const generateTemplate = (item) => {
  const html = `<li class="item-${item.slug}" data-slug="${item.slug}">
                  <input type="checkbox" id="todo_${listLength}">
                  <label for="todo_${listLength}">
                    ${item.image ? `<img class="item-image" src="${item.image}">` : `<span class="item-image item-noimg">${item.name.charAt(0)}</span>`}
                    <span class="check"></span>
                    <p>${item.name}</p>
                  </label>
                  <i class="far fa-trash-alt delete" data-slug="${item.slug}"></i>
                </li>`;
  itemList.innerHTML += html;
};

// La liste est redessinée par l'événement « inventory » (inventory.js)
function addItem(e) {
  e.preventDefault();
  const item = submitForm.add.value.trim();
  let slug = hiddenAnswer.value;
  let qty = parseInt(submitForm.qty && submitForm.qty.value) || 1;
  hiddenAnswer.value = "";
  if (item.length) {
    listLength += 1;
    submitForm.reset();
  }
  wsLNOB.addItem(slug, qty)
}

function displayItem(e) {
  if (!e.detail.remove)
    generateTemplate(e.detail.data)
}

submitForm.addEventListener("submit", addItem);
addButton.addEventListener("click", addItem);
document.addEventListener("item", displayItem);

function deleteTodos(e) {
  if (e.target.classList.contains("delete")) {
    console.log(e.target);
    let slug = e.target.getAttribute('data-slug');
    wsLNOB.delItem(slug);
  }
}

itemList.addEventListener("click", deleteTodos);

document.querySelector('input[list]').addEventListener('input', function(e) {
  var input = e.target,
      list = input.getAttribute('list'),
      options = document.querySelectorAll('#' + list + ' option'),
      hiddenInput = document.getElementById(input.getAttribute('id') + '-hidden'),
      inputValue = input.value;

  hiddenInput.value = inputValue;

  for(var i = 0; i < options.length; i++) {
    var option = options[i];

    if(option.innerText === inputValue) {
      hiddenInput.value = option.getAttribute('data-value');
      break;
    }
  }
});