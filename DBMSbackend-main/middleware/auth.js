const jwt = require("jsonwebtoken");
require("dotenv").config();

function authenticateJWT(req,res,next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(400).json({message:"Missing authorization header"});
    }
    const token = authHeader.split(" ")[1];
    if(!token){
        return res.status(400).json({message:"missign token"});
    }
    try{
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();}
        catch(err){
            return res.status(400).json({message:"Invalid or Expired token"});
        }
}
module.exports = authenticateJWT;