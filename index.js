const { Client, GatewayIntentBits, Partials } = require("discord.js");
const SpotifyWebApi = require("spotify-web-api-node");
const express = require("express");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
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
      //console.log(accessToken);
      const refreshToken = data.body["refresh_token"];

      userTokens[req.query.state] = { accessToken, refreshToken };
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
  if (message.author.bot) return;
  if (message.content.startsWith("!topartists")) {
    if (!userTokens[message.author.id]) {
      const authUrl = spotifyApi.createAuthorizeURL(
        ["user-top-read"],
        message.author.id
      );
      message.author.send(
        `Please authorize the bot by clicking [here](${authUrl}) \nPs: This bot's commands work in DMs too!`
      );
      message.channel.send(
        "Please link your Spotify account by clicking the link sent to your DMs."
      );
    } else {
      spotifyApi.setAccessToken(userTokens[message.author.id].accessToken);
      spotifyApi.setRefreshToken(userTokens[message.author.id].refreshToken);
      handleAuthenticatedUser(message);
    }
  }
});

async function handleAuthenticatedUser(message) {
  let topArtists = [];
  spotifyApi
    .getMyTopArtists({ limit: 10 })
    .then((topArtistsData) => {
      topArtists = topArtistsData.body.items;
      let response = `Choose from the following artists\n${message.author}, here are your top artists:\n`;

      topArtists.forEach((artist, index) => {
        response += `${index + 1}. ${artist.name}\n`;
      });

      message.channel.send(response);
    })
    .catch((err) => {
      console.error("Error fetching top artists:", err);
      message.channel.send("Failed to fetch top artists.");
    });

  const clipSelection = await waitForUserResponse(message);
  const selectedClipIndex = parseInt(clipSelection.content) - 1;
  const selectedArtists = topArtists[selectedClipIndex];
  const tracksArr = await getTracksName(selectedArtists.id);
  tracksArr.map((track) => {
    if (track.isCorrect === true) {
      message.channel.send(track.track.external_urls.spotify);
    }
  });
  message.channel.send("Choose the correct name of the clip above ");
  const labels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  tracksArr.map((track, index) => {
    message.channel.send(`${labels[index]}. ${track.name}`);
  });
}
function waitForUserResponse(message) {
  return new Promise((resolve) => {
    const filter = (response) => response.author.id === message.author.id;
    message.channel
      .awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] })
      .then((collected) => resolve(collected.first()))
      .catch(() => {
        message.channel.send("You took too long to respond. Please try again.");
        resolve(null);
      });
  });
}
async function getTracksName(id) {
  let track1 = await getTrackFromArtistAlbum(id);
  let track2 = await getTrackFromArtistAlbum(id);
  let track3 = await getTrackFromArtistAlbum(id);
  let track4 = await getTrackFromArtistAlbum(id);

  let trackArr = [
    {
      name: track1?.name,
      isCorrect: false,
      track: track1,
    },
    {
      name: track2?.name,
      isCorrect: false,
      track: track2,
    },
    {
      name: track3?.name,
      isCorrect: false,
      track: track3,
    },
    {
      name: track4?.name,
      isCorrect: false,
      track: track4,
    },
  ];

  let randomIndex = Math.floor(Math.random() * 4 - 1);
  trackArr[randomIndex].isCorrect = true;

  return trackArr;
}
async function getTrackFromArtistAlbum(id) {
  const albums = await fetchAlbums(id);
  if (albums && albums.length > 0) {
    const randomIndex = Math.floor(Math.random() * albums.length);
    const randomAlbum = albums[randomIndex];
    const tracks = await fetchTracksFromAlbum(randomAlbum.id);
    if (tracks && tracks.length > 0) {
      const randomTrackIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomTrackIndex];
      //console.log(randomTrack);
      return randomTrack;
    } else {
      console.log("No tracks found in the selected album.");
      return null;
    }
  }
}

async function fetchAlbums(id) {
  try {
    const data = await spotifyApi.getArtistAlbums(id);
    const albums = data.body.items;
    if (albums.length === 0) {
      console.log("No album found for this particular artist.");
    }
    return albums;
  } catch (error) {
    console.log(`ERROR fetching the albums: ${error}`);
    return null;
  }
}

async function fetchTracksFromAlbum(albumId) {
  try {
    const data = await spotifyApi.getAlbumTracks(albumId);
    return data.body.items;
  } catch (error) {
    console.log(`ERROR fetching the tracks: ${error}`);
    return null;
  }
}

client.login(process.env.DISCORD_BOT_TOKEN);
