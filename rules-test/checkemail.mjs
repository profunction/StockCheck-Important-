const API_KEY = 'AIzaSyDoW3vlbLsU1aOzlUVJ7qUGzwlh2HvhJuU';
const email = process.argv[2];
const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, continueUri: 'http://localhost' }),
  },
);
const j = await res.json();
console.log(JSON.stringify(j, null, 2));
