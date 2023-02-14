// Il s'agirait d'aller se faire foutre avec des fichiers qui s'appellent todo, j'arrivais pas à le trouver...

const submitForm = document.querySelector(".add");
const addButton = document.querySelector(".add-todo");
const itemList = document.querySelector(".todos");
const list = document.querySelectorAll(".todos li");
const hiddenAnswer = document.querySelector('#add-item-hidden');
let listLength = list.length;

const generateTemplate = (item, slug) => {
  const html = `<li>
                  <input type="checkbox" id="todo_${listLength}">
                  <label for="todo_${listLength}">
                    <span class="check"></span>
                    ${item}
                  </label>
                  <i class="far fa-trash-alt delete" data-slug="${slug}"></i>
                </li>`;
  itemList.innerHTML += html;
};

function addItem(e) {
  e.preventDefault();
  const item = submitForm.add.value.trim();
  let slug = hiddenAnswer.value;
  hiddenAnswer.value = "";
  if (item.length) {
    listLength += 1;
    generateTemplate(item, slug);
    submitForm.reset();
  }
  wsLNOB.addItem(slug)
}

submitForm.addEventListener("submit", addItem);
addButton.addEventListener("click", addItem);

function deleteTodos(e) {
  if (e.target.classList.contains("delete")) {
    console.log(e.target);
    let slug = e.target.getAttribute('data-slug');
    wsLNOB.delItem(slug);
    e.target.parentElement.remove();
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