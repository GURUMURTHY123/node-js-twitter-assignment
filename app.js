const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let dbObject = null;

const initializeDbAndServer = async () => {
  try {
    dbObject = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const checkValidTweetId = (tweetIds, tweetId) => {
  for (let eachTweet of tweetIds) {
    if (eachTweet.tweet_id === parseInt(tweetId)) {
      return true;
    }
  }
  return false;
};

const isValidPassword = (password) => password.length > 5;

const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    const isValidJwt = jwt.verify(jwtToken, "My_Token", (err, payload) => {
      if (err) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (req, res) => {
  const { username, name, password, gender } = req.body;
  const checkUserQuery = `Select * from user where username='${username}'`;
  const hashedPassword = await bcrypt.hash(password, 10);
  const dbUser = await dbObject.get(checkUserQuery);
  if (dbUser !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else {
    if (isValidPassword(password)) {
      const addUserQuery = `Insert into user(username, name, password, gender) values('${username}', '${name}', '${hashedPassword}', '${gender}')`;
      await dbObject.run(addUserQuery);
      res.status(200);
      res.send("User created successfully");
    } else {
      res.status(400);
      res.send("Password is too short");
    }
  }
});

//Api 2

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const checkUserQuery = `Select * from user where username='${username}'`;
  const dbUser = await dbObject.get(checkUserQuery);
  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "My_Token");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

//Api 3

app.get("/user/tweets/feed/", authenticateToken, async (req, res) => {
  const { username } = req;
  const getTweetsQuery = `
        Select u2.username, t.tweet, t.date_time
        From user u inner join follower f on u.user_id = f.follower_user_id 
              join tweet t on f.following_user_id = t.user_id
              join user u2 on t.user_id = u2.user_id
        where u.username = '${username}'
        order by date_time desc
        limit 4; `;
  const tweetsData = await dbObject.all(getTweetsQuery);
  res.send(
    tweetsData.map((eachTweet) => ({
      username: eachTweet.username,
      tweet: eachTweet.tweet,
      dateTime: eachTweet.date_time,
    }))
  );
});

//Api 4

app.get("/user/following/", authenticateToken, async (req, res) => {
  const { username } = req;
  const getFollowingNamesQuery = `
        select u2.name
        from  user u inner join follower f on u.user_id = f.follower_user_id 
              join user u2 on f.following_user_id = u2.user_id 
        where u.username = '${username}'
        `;
  const getNames = await dbObject.all(getFollowingNamesQuery);
  res.send(getNames);
});

//Api 5

app.get("/user/followers/", authenticateToken, async (req, res) => {
  const { username } = req;
  const getFollowingNamesQuery = `
        select u2.name
        from  user u inner join follower f on u.user_id = f.following_user_id 
              join user u2 on f.follower_user_id = u2.user_id 
        where u.username = '${username}'
        `;
  const getNames = await dbObject.all(getFollowingNamesQuery);
  res.send(getNames);
});

//Api 6

app.get("/tweets/:tweetId", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { username } = req;
  const dbQuery = `
        select tweet, count(DISTINCT l.user_id) as likes, count(Distinct reply_id) as replies, t. date_time as dateTime
        from tweet t join reply r on t.tweet_id = r.tweet_id
             join like l on l.tweet_id = t.tweet_id
        where ${tweetId} in (
            Select t.tweet_id
            From user u inner join follower f on u.user_id = f.follower_user_id 
              join tweet t on f.following_user_id = t.user_id
              join user u2 on t.user_id = u2.user_id
            where u.username = "${username}"
        ) and t.tweet_id = ${tweetId}`;
  const response = await dbObject.get(dbQuery);
  if (response.tweet === null) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send(response);
  }
});

//Api 7

app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { username } = req;
  const dbQuery = `
        select group_concat(Distinct u.username) as usernames
        from tweet t join reply r on t.tweet_id = r.tweet_id
             join like l on l.tweet_id = t.tweet_id
             join user u on l.user_id = u.user_id
        where ${tweetId} in (
            Select t.tweet_id
            From user u inner join follower f on u.user_id = f.follower_user_id 
              join tweet t on f.following_user_id = t.user_id
              join user u2 on t.user_id = u2.user_id
            where u.username = "${username}"
        ) and t.tweet_id = ${tweetId}`;
  const response = await dbObject.get(dbQuery);
  if (response.usernames === null) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send({
      likes: response.usernames.split(","),
    });
  }
});

//Api 8

app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { username } = req;
  const dbQuery = `
        select DISTINCT u.name as name, reply
        from tweet t join reply r on t.tweet_id = r.tweet_id
            join user u on r.user_id = u.user_id
             join like l on l.tweet_id = t.tweet_id
        where ${tweetId} in (
            Select t.tweet_id
            From user u inner join follower f on u.user_id = f.follower_user_id 
              join tweet t on f.following_user_id = t.user_id
              join user u2 on t.user_id = u2.user_id
            where u.username = "${username}"
        ) and t.tweet_id = ${tweetId}`;
  const response = await dbObject.all(dbQuery);
  if (response.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send({
      replies: response,
    });
  }
});

// Api 9

app.get("/user/tweets/", authenticateToken, async (req, res) => {
  const { username } = req;
  const dbQuery = `
        select tweet, count(DISTINCT l.user_id) as likes, count(Distinct reply_id) as replies, t. date_time as dateTime
        from tweet t join user u on t.user_id = u.user_id
             join reply r on t.tweet_id = r.tweet_id
             join like l on l.tweet_id = t.tweet_id
        where u.username = "${username}"
        group by t.tweet_id`;
  const response = await dbObject.all(dbQuery);
  res.send(response);
});

//Api 10

app.post("/user/tweets", authenticateToken, async (req, res) => {
  const { tweet } = req.body;
  const { username } = req;
  const getUserId = `Select user_id as userId from user where username='${username}'`;
  const { userId } = await dbObject.get(getUserId);
  const createTweetQuery = `Insert into tweet(tweet, user_id, date_time) values('${tweet}',${userId},'${new Date()}')`;
  await dbObject.run(createTweetQuery);
  res.send("Created a Tweet");
});

//Api 11

app.delete("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { username } = req;
  const getUserTweetId = `select tweet_id from tweet t join user u on t.user_id = u.user_id where username='${username}'`;
  const tweetIds = await dbObject.all(getUserTweetId);
  const isValid = checkValidTweetId(tweetIds, tweetId);
  if (isValid) {
    const deleteTweetQuery = `Delete from tweet where tweet_id=${tweetId}`;
    await dbObject.run(deleteTweetQuery);
    res.send("Tweet Removed");
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

module.exports = app;
