// Conf
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/../.env" });

// General
import * as fs from "fs";
import axios from "axios";

interface Actions {
	rfid?: { [key: string]: RFID | ButtonRFID };
	cameras?: Camera[];
}

interface Camera {
	name: string;
	id: number;
	api: string;
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

// Actions
import YAML from "yaml";
const actions: Actions = YAML.parse(fs.readFileSync("actions.yaml", "utf8"));
let panicState = false;
let panicTimer: NodeJS.Timeout;

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
app.use(
	(req: express.Request, res: express.Response, next: express.NextFunction) => {
		const slackSignature = req.headers["x-slack-signature"];
		const requestBody = qs.stringify(req.body, { format: "RFC1738" });
		const timestamp = parseInt(
			req.headers["x-slack-request-timestamp"] as any,
			10
		);
		const time = Math.floor(new Date().getTime() / 1000);
		if (Math.abs(time - timestamp) > 300) {
			console.warn("Ignoring request");
			return res.status(400).send("Ignore this request.");
		}
		if (
			!process.env.SLACK_SIGNING_SECRET ||
			typeof slackSignature !== "string"
		) {
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
	}
);

// Attach the slash command handler
app.post(
	"/slack/huutele",
	(req: express.Request, res: express.Response, next: express.NextFunction) => {
		const status = setAlarm(true);
		console.log("New status", status);
		res.json({
			response_type: "in_channel",
			text: `@${req.body.user_name} Ooookkei, huutelen kuha jotai tapahtuu... :eyes:`,
		});
	}
);

app.post(
	"/slack/stfu",
	(req: express.Request, res: express.Response, next: express.NextFunction) => {
		const status = setAlarm(false);
		console.log("New status", status);
		res.json({
			response_type: "in_channel",
			text: `@${req.body.user_name} Ooookkei, imma stfu`,
		});
	}
);

app.post(
	"/slack/kuva",
	(req: express.Request, res: express.Response, next: express.NextFunction) => {
		res.json({
			response_type: "in_channel",
			text: `@${req.body.user_name} Kuvat tulee kuha ehdin...`,
		});
		sendLatestSequences(true);
	}
);

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
	console.log("MQTT raw message on topic:", topic);
	console.log(message.toString());
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
	icon_emoji: "factory",
};

// When a door sensor is triggered
function doorOpen(name: string = "unknown") {
	// Check if we should alarm
	if (getAlarm()) {
		console.log(`Door ${name} opened, alarming`);
		panic();
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
	// Check if we should alarm
	if (getAlarm()) {
		console.log(`Motion detected in ${name}, alarming`);
		panic();
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
		// Just ignore
	}
	return status;
}

export interface Capture {
	time: string;
	src: string;
	local_src: string;
	metadata: Metadata;
	type: string;
}

export interface Metadata {
	key: string;
	user: string;
	timestamp: number;
	microseconds: string;
	instanceName: string;
	regionCoordinates: string;
	numberOfChanges: string;
	token: string;
}

const cameras: { [key: string]: string } = {};

async function sendLatestSequences(force = false) {
	try {
		for (const camera of actions.cameras) {
			console.log("Fetching for camera", camera.id);
			const latestSequence = await axios.get(
				`${camera.api}/api/v1/images/latest_sequence`,
				{
					auth: {
						username: process.env[`CAM_USERNAME_${camera.id}`],
						password: process.env[`CAM_PASSWORD_${camera.id}`],
					},
				}
			);
			const latestRecording = latestSequence.data.slice(-1)[0] as Capture;
			if (typeof latestRecording === "undefined" || typeof latestRecording.src !== "string") {
				console.warn("Couldn't get the last recording. Sequence:", latestSequence);
				return false;
			}
			if (
				typeof cameras[camera.id] === "undefined" ||
				cameras[camera.id] !== latestRecording.src ||
				force
			) {
				// A new capture found!
				cameras[camera.id] = latestRecording.src;
				// Send media via Slack
				axios({
					method: "get",
					url: latestRecording.src,
					responseType: "stream",
				}).then(async (res) => {
					console.log("Starting to upload");
					const result = await web.files.upload({
						filename: latestRecording.metadata.key,
						channels: process.env.SLACK_CHANNEL,
						title: `${latestRecording.time} - ${camera.name}`,
						// You can use a ReadableStream or a Buffer for the file option
						// This file is located in the current directory (`process.pwd()`), so the relative path resolves
						file: res.data,
					});
					console.log("Uploaded?", result.ok);
				});
			} else {
				// An old capture, do nothing?
			}
		}
	} catch (e) {
		console.error(e);
	}
}

// We enter a panic mode for 5 minutes and during that time, we send all new captured media every 30 seconds
function panic() {
	console.log("Entering panic state");
	panicState = true;
	clearTimeout(panicTimer);
	panicTimer = setTimeout(() => {
		console.log("We can now stop panicing as timeout has been reached...");
		panicState = false;
	}, 600_000);
}

setInterval(() => {
	// Are we in panic mode? Should we upload every new capture?
	if (panicState) {
		console.log("We are in panic state, sending latest sequence");
		sendLatestSequences();
	}
}, 30_000);
