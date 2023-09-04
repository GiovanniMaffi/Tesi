var express = require('express');
var app = express();
var https = require('https')
const fs = require('fs')

app.get('/', function (req, res) {
    fs.createReadStream('index.html').pipe(res)
})

app.use(express.static('public'))

var privKey = fs.readFileSync('certificates/domain.key')
var cert = fs.readFileSync('certificates/domain.crt')


https.createServer({
    key: privKey,
    cert: cert
}, app).listen(8081);


