// Conf
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });

// MQTT
import * as mqtt from "mqtt";

// Slack
import { WebClient, WebAPICallResult } from "@slack/web-api";

// Slack auth
import * as passport from "passport";
import { SlackStrategy } from "@aoberoi/passport-slack";

// Storage
import { LocalStorage } from "node-localstorage";

// Express
import * as http from "http";
import express from "express";

console.log("Connecting");
const client = mqtt.connect(process.env.MQTT);
client.on("connect", () => {
		client.subscribe("#", function (err) {
			if (err) {
				console.error(err);
			} else {
					console.log("Stuff");
			}
		});
	});

	client.on("message", function (topic, message) {
		// message is Buffer
		console.log("message:", topic);
		console.log(message.toString());
	});


	const web = new WebClient(process.env.SLACK_TOKEN);

	interface ChatPostMessageResult extends WebAPICallResult {
		channel: string;
		ts: string;
		message: {
			text: string;
		};
	}

	(async () => {
		// The result is cast to the interface
		const res = (await web.chat.postMessage({ text: "Hello world", channel: "C012345" }) as ChatPostMessageResult);

		// Properties of the result are now typed
		console.log(
			`A message was posed to conversation ${res.channel} with id ${res.ts} which contains the message ${res.message}`
		);
	})();