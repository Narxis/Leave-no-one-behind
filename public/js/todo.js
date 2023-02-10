// Il s'agirait d'aller se faire foutre avec des fichiers qui s'appellent todo, j'arrivais pas à le trouver...

const submitForm = document.querySelector(".add");
const addButton = document.querySelector(".add-todo");
const todoList = document.querySelector(".todos");
const list = document.querySelectorAll(".todos li");

let listLength = list.length;

const generateTemplate = (todo) => {
  const html = `<li>
                  <input type="checkbox" id="todo_${listLength}">
                  <label for="todo_${listLength}">
                    <span class="check"></span>
                    ${todo}
                  </label>
                  <i class="far fa-trash-alt delete"></i>
                </li>`;
  todoList.innerHTML += html;
};

function addItem(e) {
  e.preventDefault();
  const todo = submitForm.add.value.trim();
  if (todo.length) {
    listLength += 1;
    generateTemplate(todo);
    submitForm.reset();
  }
  wsLNOB.addItem(todo)
}

submitForm.addEventListener("submit", addItem);
addButton.addEventListener("click", addItem);

function deleteTodos(e) {
  if (e.target.classList.contains("delete")) {
    e.target.parentElement.remove();
  }
}

todoList.addEventListener("click", deleteTodos);