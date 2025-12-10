const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const shapeSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
    },
    x: {
      type: Number,
      required: true,
    },
    y: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    fill: {
      type: String,
      required: true,
    },
    isPrivate: {
      type: Boolean,
      required: true,
    },
    isLocked: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true }
);

const Shape = mongoose.model("shared-shapes", shapeSchema);
module.exports = Shape;
