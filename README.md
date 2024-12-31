# SMS Expense Tracker

Install
```
brew install hugo npm
sudo npm install netlify-cli -g
sudo npm install
```

Testing netlify
```
# run server
sudo netlify dev --live

# hook-up ngrok for outside access
ngrok http 8083 --host-header="localhost:8083"  # use correct server
```