const STORAGE_KEY = 'livetta_products';

function getProducts() {
  const products = localStorage.getItem(STORAGE_KEY);

  if (!products) {
    return [];
  }

  return JSON.parse(products);
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function addProduct(product) {
  const products = getProducts();

  products.push(product);

  saveProducts(products);
}