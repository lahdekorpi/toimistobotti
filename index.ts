// Conf
import * as dotenv from "dotenv";
const env = dotenv.config({ path: __dirname+'/.env' }).parsed;

// MQTT
import * as mqtt from "mqtt";

// Slack
import { createEventAdapter, errorCodes } from "@slack/events-api";
import { WebClient } from "@slack/web-api";

// Slack auth
import * as passport from "passport";
import { SlackStrategy } from "@aoberoi/passport-slack";

// Storage
import { LocalStorage } from "node-localstorage";

// Express
import http from "http";
import express from "express";

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


  // Load environment variables from `.env` file.
require('dotenv').config();

let slackEvents;
// *** Initialize event adapter using signing secret from environment variables ***
try {
  slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET, {
    includeBody: true
  });
} catch (error) {
    logConfigurationError(['SLACK_SIGNING_SECRET']);
}

// Initialize a Local Storage object to store authorization info
// NOTE: This is an insecure method and thus for demo purposes only!
const botAuthorizationStorage = new LocalStorage('./storage');

// Helpers to cache and lookup appropriate client
// NOTE: Not enterprise-ready. if the event was triggered inside a shared channel, this lookup
// could fail but there might be a suitable client from one of the other teams that is within that
// shared channel.
const clients = {};
function getClientByTeamId(teamId) {
  if (!clients[teamId] && botAuthorizationStorage.getItem(teamId)) {
    clients[teamId] = new WebClient(botAuthorizationStorage.getItem(teamId));
  }
  if (clients[teamId]) {
    return clients[teamId];
  }
  return null;
}

// Initialize Add to Slack (OAuth) helpers
let strategy;
try {
  strategy = new SlackStrategy({
    clientID: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    skipUserProfile: true,
  }, (accessToken, scopes, team, extra, profiles, done) => {
    botAuthorizationStorage.setItem(team.id, extra.bot.accessToken);
    done(null, {});
  });
} catch (error) {
    logConfigurationError(['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET']);
}

passport.use(strategy);

// Initialize an Express application
const app = express();

// Plug the Add to Slack (OAuth) helpers into the express app
app.use(passport.initialize());
app.get('/', (req, res) => {
  res.send('<a href="/auth/slack"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>');
});
app.get('/auth/slack', passport.authenticate('slack', {
  scope: ['bot']
}));
app.get('/auth/slack/callback',
  passport.authenticate('slack', { session: false }),
  (req, res) => {
    res.send('<p>Greet and React was successfully installed on your team.</p>');
  },
  (err, req, res, next) => {
    res.status(500).send(`<p>Greet and React failed to install</p> <pre>${err}</pre>`);
  }
);

// *** Plug the event adapter into the express app as middleware ***
app.use('/slack/events', slackEvents.expressMiddleware());

// *** Attach listeners to the event adapter ***


// *** Greeting any user that says "hi" ***
slackEvents.on('message', (message, body) => {
  // Only deal with messages that have no subtype (plain messages) and contain 'hi'
  if (!message.subtype && message.text.indexOf('hi') >= 0) {
    // Initialize a client
    const slack = getClientByTeamId(body.team_id);
    // Handle initialization failure
    if (!slack) {
      return console.error('No authorization found for this team. Did you install the app through the url provided by ngrok?');
    }

    (async () => {
      try {
        // Respond to the message back in the same channel
        const response = await slack.chat.postMessage({ channel: message.channel, text: `Hello <@${message.user}>! :tada:` });
      } catch (error) {
        console.log(error.data);
      }
    })();
  }
});

// *** Responding to reactions with the same emoji ***
slackEvents.on('reaction_added', (event, body) => {
  // Initialize a client
  const slack = getClientByTeamId(body.team_id);
  // Handle initialization failure
  if (!slack) {
    return console.error('No authorization found for this team. Did you install the app through the url provided by ngrok?');
  }
  // Respond to the reaction back with the same emoji

  (async () => {
    try {
      // Respond to the message back in the same channel
      const response = await slack.chat.postMessage({ channel: event.item.channel, text: `:${event.reaction}:` });
    } catch (error) {
      console.log(error.data);
    }
  })();
});

// *** Handle errors ***
slackEvents.on('error', (error) => {
//   if (error.code === errorCodes.TOKEN_VERIFICATION_FAILURE) {
    // This error type also has a `body` propery containing the request body which failed verification.
    // console.error(`An unverified request was sent to the Slack events Request URL. Request body: \
// ${JSON.stringify(error.body)}`);
//   } else {
    console.error(`An error occurred while handling a Slack event: ${error.message}`);
//   }
});

// Start the express application
const port = process.env.PORT || 3000;
http.createServer(app).listen(port, () => {
  console.log(`server listening on port ${port}`);
});


/**
 * Logs a configuration error to console with given missing variable names.
 * @param {Array} envVarNames
 */
function logConfigurationError(envVarNames) {
  const description = envVarNames.length > 1 ?
    `${envVarNames.join(', ')} environment variables` :
    `${envVarNames[0]} environment variable`;
  console.log(`***\nCould not start up the application. Have you set your ${description}?\n\nSee https://github.com/slackapi/node-slack-sdk/blob/master/examples/greet-and-react/README.md#run-locally-or-\n`);
}