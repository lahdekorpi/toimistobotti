// Conf
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/../.env" });

// MQTT
import * as mqtt from "mqtt";

// Slack
import { WebClient, WebAPICallResult } from "@slack/web-api";

// // Slack auth
// import * as passport from "passport";
// import { SlackStrategy } from "@aoberoi/passport-slack";

// // Storage
// import { LocalStorage } from "node-localstorage";

// // Express
// import * as http from "http";
// import express from "express";

// Init MQTT and make sure it is listening to stuff
console.log("Connecting");
const client = mqtt.connect(process.env.MQTT);
client.on("connect", () => {
	console.log("MQTT connected");
	client.subscribe("#", (err) => {
		if (err) {
			console.error("MQTT error", err);
		} else {
			console.log("Stuff");
		}
	});
});

client.on("message", (topic, message) => {
	// message is Buffer
	console.log("MQTT message:", topic);
	console.log(message.toString());
	// TODO:
	// Parse JSON if the message contains JSON
	// Make sure the event is what we are looking for
	// Make sure if receiving RF data, that the payload is in the known array
});

console.log("Creating Slack client with token", process.env.SLACK_TOKEN);
const web = new WebClient(process.env.SLACK_TOKEN);

interface ChatPostMessageResult extends WebAPICallResult {
	channel: string;
	ts: string;
	message?: {
		text: string;
	};
	blocks?: any;
}

(async () => {
	// The result is cast to the interface
	const res = (await web.chat.postMessage({
		text: "Incoming",
		username: "toimisto",
		icon_emoji: "factory",
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "This is a header block",
					emoji: true,
				},
			},
			{
				type: "divider",
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: {
							type: "plain_text",
							text: "Farmhouse",
							emoji: true,
						},
						value: "click_me_123",
					},
					{
						type: "button",
						text: {
							type: "plain_text",
							text: "Kin Khao",
							emoji: true,
						},
						value: "click_me_123",
						url: "https://google.com",
					},
					{
						type: "button",
						text: {
							type: "plain_text",
							text: "Ler Ros",
							emoji: true,
						},
						value: "click_me_123",
						url: "https://google.com",
					},
				],
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: "This is a section block with a button.",
				},
				accessory: {
					type: "button",
					text: {
						type: "plain_text",
						text: "Click Me",
						emoji: true,
					},
					value: "click_me_123",
					url: "https://google.com",
					action_id: "button-action",
				},
			},
		],
		channel: process.env.SLACK_CHANNEL,
	})) as ChatPostMessageResult;

	// Properties of the result are now typed
	console.log(
		`A message was posed to conversation ${res.channel} with id ${res.ts} which contains the message ${res.message}`
	);
})();
