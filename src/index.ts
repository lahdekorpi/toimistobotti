// Conf
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/../.env" });
import * as fs from "fs";
interface Actions {
	rfid: { [key: string]: RFID | ButtonRFID };
}

interface RFID {
	type: "pir" | "door";
	name: string;
}

interface ButtonRFID {
	name?: string;
	type: "button";
	action: string; // Actions are only for the buttons
}

import YAML from "yaml";
const actions: Actions = YAML.parse(fs.readFileSync("actions.yaml", "utf8"));

// MQTT
import * as mqtt from "mqtt";

// Slack
import { WebClient, WebAPICallResult } from "@slack/web-api";
import { createEventAdapter } from "@slack/events-api";

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
	const rfid = "";
	const event = actions.rfid[rfid];
	if (typeof event === "object") {
		switch (event.type) {
			case "pir":
				// Motion detected
				motionDetected(event.name);
				break;
			case "door":
				doorOpen(event.name);
				break;
			case "button":
				buttonPress(event);
				break;
			default:
				console.warn("Unknown event type", event);
				break;
		}
	} else {
		console.log("Unknown RFID event");
	}
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
		username: "Toimisto",
		subtype: "bot_message",
		bot_id: process.env.SLACK_BOT_ID,
		icon_emoji: "poop",
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

console.log("Got here for the events");

(async () => {
	console.log("Creating SlackEvents");
	const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
	const port = parseInt(process.env.PORT, 10) || 3000;

	// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
	slackEvents.on("message", (event) => {
		console.log(
			`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`
		);
	});

	console.log("Starting server");
	const server = await slackEvents.start(port);
	console.log(`Listening for events on ${server.address()}`);
})();

// When a door sensor is triggered
function doorOpen(name: string = "unknown") {
	// TODO:
	// Check if we should alarm
	if (getAlarm()) {
		console.log(`Door ${name} opened, alarming`);
		// Send message to slack
	} else {
		console.log(`Door ${name} opened but alarm isn't set, so ignoring`);
	}
}

function motionDetected(name: string = "unknown") {
	// TODO:
	// Check if we should alarm
	if (getAlarm()) {
		console.log(`Motion detected in ${name}, alarming`);
		// Send message to slack
	} else {
		console.log(`Motion detected in ${name} but alarm isn't set, so ignoring`);
	}
}

function buttonPress(event: ButtonRFID) {
	switch (event.action) {
		case "doorBell":
			doorBell();
			break;
		default:
			console.warn(`Unknown action ${event.action}`);
			break;
	}
}

// Run if the doorbell has been pressed
function doorBell() {
	// TODO:
	// Doorbell pressed, take an image from the front door camera and send to Slack
	// Trigger a MQTT event to trigger additional stuff if needed
}

// Get the current alarmed status
function getAlarm() {
	return fs.existsSync(process.env.STATUS_FILE);
}

// Set the alarmed status
function setAlarm(status: boolean) {
	try {
		if (status) {
			fs.unlinkSync(process.env.STATUS_FILE);
		} else {
			fs.writeFileSync(process.env.STATUS_FILE, new Date().toISOString());
		}
	} catch (e) {
		console.error(e);
	}
	return status;
}
