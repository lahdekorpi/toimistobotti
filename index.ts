import * as dotenv from "dotenv";
import * as mqtt from "mqtt";

const env = dotenv.config({ path: __dirname+'/.env' }).parsed;

console.log("Connecting");
const client = mqtt.connect(env.MQTT);
client.on("connect", () => {
    client.subscribe("#", function (err) {
      if (err) {
        console.error(err);
      } else {
          console.log("Stuff");
      }
    })
  })
   
  client.on('message', function (topic, message) {
    // message is Buffer
    console.log("message:", topic);
    console.log(message.toString());
  })