const mongoose = require("mongoose");

// Creating a database
mongoose.connect("mongodb://localhost:27017/cricbuzz", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(()=>console.log("Connection successful"))
.catch((err)=>console.log(err.message));
