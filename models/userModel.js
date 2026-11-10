const mongoose = require("mongoose")
const {Schema} = mongoose

const useSchema = new Schema({
    name: {
        type: String,
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        index: true,
    },
    password: {
        type: String,
    },
    phone: {
        type: String,
    },
    isVerified:{
        type: Boolean,
        default: false
    },
    role:{
        type: String,
        enum: ['admin','user','editor','vendor'],
        default: 'user'
    },
    isHold: {
        type: Boolean,
        default: false
    },
    postalCode:{
        type: String,
    },
    address:{
        type: String,
    },
    city:{
         type: String,
    },
    isDelete:{
        type: Boolean,
        default: false,
    },
    billingAddress:{
        fullName: {
        type: String,
        },
        email: {
            type: String,
        },
        street:{
            type: String,
        },
        zipCode:{
            type: String,
        },
        phoneNumber: {
            type: String,
        },
    }
}, {timestamps: true})

module.exports = mongoose.model('User',useSchema)