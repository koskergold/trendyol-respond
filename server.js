const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.get('/', (req,res)=>res.send('OK'));

app.listen(3000);
