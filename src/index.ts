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
import express from "express";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";

import qs from "qs";

const app = express();

app.use(express.urlencoded({ extended: false }));

// Validate all reqeusts coming from Slack to be from Slack
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
	const slackSignature = req.headers["x-slack-signature"];
	const requestBody = qs.stringify(req.body, { format: "RFC1738" });
	const timestamp = parseInt(
		req.headers["x-slack-request-timestamp"] as any,
		10
	);
	console.log(req.headers["x-slack-request-timestamp"], timestamp);
	const time = Math.floor(new Date().getTime() / 1000);
	if (Math.abs(time - timestamp) > 300) {
		console.warn("Ignoring request");
		return res.status(400).send("Ignore this request.");
	}
	if (!process.env.SLACK_SIGNING_SECRET || typeof slackSignature !== "string") {
		console.warn("Signing key is empty");
		return res.status(400).send("Slack signing secret is empty.");
	}
	const sigBasestring = "v0:" + timestamp + ":" + requestBody;
	const mySignature =
		"v0=" +
		createHmac("sha256", process.env.SLACK_SIGNING_SECRET)
			.update(sigBasestring, "utf8")
			.digest("hex");
	if (
		timingSafeEqual(
			Buffer.from(mySignature, "utf8"),
			Buffer.from(slackSignature, "utf8")
		)
	) {
		console.log("Signature verification success");
		next();
	} else {
		console.log("Signature verification failed");
		return res.status(400).send("Verification failed");
	}
});

// Attach the slash command handler
app.post("/slack/huutele", (req: express.Request, res: express.Response, next: express.NextFunction) => {
	const status = setAlarm(true);
	console.log("New status", status);
	res.json({
		response_type: "in_channel",
		text: `@${req.body.user_name} Ooookkei, huutelen kuha jotai tapahtuu... :eyes:`,
	});
});

app.post("/slack/stfu", (req: express.Request, res: express.Response, next: express.NextFunction) => {
	const status = setAlarm(false);
	console.log("New status", status);
	res.json({
		response_type: "in_channel",
		text: `@${req.body.user_name} Ooookkei, imma stfu`,
	});
});

app.post("/slack/kuva", (req: express.Request, res: express.Response, next: express.NextFunction) => {
	res.json({
		response_type: "in_channel",
		text: `@${req.body.user_name} Kuvat tulee kuha ehdin...`,
	});
});

const port = process.env.PORT || 0;
createServer(app).listen(port, () => {
	console.log(`server listening on port ${port}`);
});

// Init MQTT and make sure it is listening to stuff
console.log("Connecting", process.env.MQTT);
const client = mqtt.connect(process.env.MQTT);
client.on("connect", () => {
	console.log("MQTT connected");
	client.subscribe(process.env.MQTT_TOPIC, (err) => {
		if (err) {
			console.error("MQTT error", err);
		} else {
			console.log("MQTT subscribed");
		}
	});
});

client.on("message", (topic, message) => {
	// message is Buffer
	console.log("MQTT message:", topic);
	console.log(message.toString());
	// TODO:
	// Parse JSON if the message contains JSON
	let data: any = {};
	try {
		data = JSON.parse(message.toString());
	} catch (e) {
		console.error("Invalid JSON in MQTT payload");
		return false;
	}
	console.log(data);
	// Make sure the event is what we are looking for
	if (
		typeof data.RfReceived !== "object" ||
		typeof data.RfReceived.Data !== "string"
	) {
		console.error("Data field in the JSON payload is missing");
		return false;
	}
	// Make sure if receiving RF data, that the payload is in the known array
	const event = actions.rfid[data.RfReceived.Data];
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

web.chat.postMessage({
	channel: process.env.SLACK_CHANNEL,
	text: "Incoming",
	username: "Toimisto",
	subtype: "bot_message",
	bot_id: process.env.SLACK_BOT_ID,
	icon_emoji: "factory",
	blocks: [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: ":rocket: Toimistobotti boottas!",
				emoji: true,
			},
		},
	],
});
interface ChatPostMessageResult extends WebAPICallResult {
	channel: string;
	ts: string;
	message?: {
		text: string;
	};
	blocks?: any;
}

const baseBot = {
	channel: process.env.SLACK_CHANNEL,
	text: "Incoming",
	username: "Toimisto",
	subtype: "bot_message",
	bot_id: process.env.SLACK_BOT_ID,
	icon_emoji: "factory"
};

// When a door sensor is triggered
function doorOpen(name: string = "unknown") {
	// TODO:
	// Check if we should alarm
	if (getAlarm()) {
		console.log(`Door ${name} opened, alarming`);
		// Send message to slack
		web.chat.postMessage({
			...baseBot,
			blocks: [
				{
					type: "header",
					text: {
						type: "plain_text",
						text: `Ovi avattu: ${name}`,
						emoji: true,
					},
				},
				{
					type: "divider",
				},
				{
					type: "section",
					text: {
						type: "plain_text",
						text: "Kuva tulloo tänne kohta...",
					},
				},
			],
		});
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
		web.chat.postMessage({
			...baseBot,
			blocks: [
				{
					type: "header",
					text: {
						type: "plain_text",
						text: `Liikettä havaittu: ${name}`,
						emoji: true,
					},
				},
				{
					type: "divider",
				},
				{
					type: "section",
					text: {
						type: "plain_text",
						text: "Kuva tulloo tänne kohta...",
					},
				},
			],
		});
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
			fs.writeFileSync(process.env.STATUS_FILE, new Date().toISOString());
		} else {
			fs.unlinkSync(process.env.STATUS_FILE);
		}
	} catch (e) {
		console.error(e);
	}
	return status;
}

// TODO:
// monitor for the latest available video with setInterval if we are alarmed and every time it changes, upload to Slack
