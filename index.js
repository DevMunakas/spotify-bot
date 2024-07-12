const { Client, GatewayIntentBits } = require("discord.js");
const SpotifyWebApi = require("spotify-web-api-node");
const express = require("express");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

const app = express();

// This is a temporary solution for storing access tokens, will use a database in the future
let userTokens = {};

app.get("/callback", (req, res) => {
  const code = req.query.code;
  spotifyApi
    .authorizationCodeGrant(code)
    .then((data) => {
      const accessToken = data.body["access_token"];
      console.log(accessToken);
      const refreshToken = data.body["refresh_token"];

      userTokens[req.query.state] = { accessToken, refreshToken };

      spotifyApi.setAccessToken(accessToken);
      spotifyApi.setRefreshToken(refreshToken);

      res.send("Successfully authenticated. You can close this window.");
    })
    .catch((err) => {
      console.error("Error during authorization:", err);
      res.send("Failed to authenticate.");
    });
});

app.listen(process.env.PORT, () => {
  console.log("Express server running on port " + process.env.PORT);
});

client.once("ready", () => {
  console.log("Connected to discord as " + client.user.tag);
});

client.on("messageCreate", async (message) => {
  console.log(message.content);
  if (message.content.startsWith("!topartists")) {
    if (!userTokens[message.author.id]) {
      const authUrl = spotifyApi.createAuthorizeURL(
        ["user-top-read"],
        message.author.id
      );
      message.author.send(
        `Please authorize the bot by clicking [here](${authUrl})`
      );
      message.channel.send(
        "Please link your Spotify account by clicking the link sent to your DMs."
      );
    } else {
      spotifyApi.setAccessToken(userTokens[message.author.id].accessToken);
      spotifyApi.setRefreshToken(userTokens[message.author.id].refreshToken);

      spotifyApi
        .getMyTopArtists({ limit: 10 })
        .then((topArtistsData) => {
          const topArtists = topArtistsData.body.items;
          let response = `${message.author}, here are your top artists:\n`;

          topArtists.forEach((artist, index) => {
            response += `${index + 1}. ${artist.name}\n`;
          });

          message.channel.send(response);
        })
        .catch((err) => {
          console.error("Error fetching top artists:", err);
          message.channel.send("Failed to fetch top artists.");
        });
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
