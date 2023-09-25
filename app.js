const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//Below are Twitter APIs 

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  if(password.length < 6) {
      response.status(400);
      response.send("Password is too short");
      return;
  }
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, password, name, gender) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}', 
          '${name}',
          '${gender}'
        )`;
    await db.run(createUserQuery);
    response.send("User created successfully");
  }
  else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2 
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "I love node.js");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with JWT Token
const authenticateToken = (request, response, next) => {
  const {tweet} = request.body;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "I love node.js", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const userIdArray = await db.get(getUserIdQuery);
  const {user_id} = userIdArray;
  const getTweetsQuery = `
   SELECT
    user.user_id,
    user.username,
    tweet.tweet_id,
    tweet.tweet,
    tweet.date_time AS dateTime
   FROM
    (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T 
    INNER JOIN user ON T.user_id = user.user_id
   WHERE 
    follower.follower_user_id = '${user_id}'
   ORDER BY 
    dateTime DESC
   LIMIT 4
   OFFSET 0;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const userIdArray = await db.get(getUserIdQuery);
  const {user_id} = userIdArray;
  const getFollowerQuery = `
    SELECT 
     DISTINCT name
    FROM
        follower INNER JOIN user ON follower.following_user_id = user.user_id
    WHERE 
     follower.follower_user_id = '${user_id}' 
     ; 
  `;
  const followersArray = await db.all(getFollowerQuery);
  response.send(followersArray);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const userIdArray = await db.get(getUserIdQuery);
  const {user_id} = userIdArray;
  const getFollowerQuery = `
    SELECT 
     DISTINCT user.name
    FROM
        follower INNER JOIN user ON follower.follower_user_id = user.user_id
    WHERE 
     follower.following_user_id = '${user_id}' 
     ; 
  `;
  const followersArray = await db.all(getFollowerQuery);
  response.send(followersArray);
});

//API 6 
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const userIdArray = await db.get(getUserIdQuery);
  console.log(userIdArray);

  const getFollowingTweetQuery = `
    SELECT 
      follower.following_user_id 
    FROM 
      tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE 
      tweet.tweet_id = ${tweetId}
      AND 
      follower.follower_user_id = ${userIdArray.user_id}
  `;
  const followingTweetsArray = await db.all(getFollowingTweetQuery);
  console.log(followingTweetsArray);
  if(followingTweetsArray.length === 0) {
      response.status(401);
      response.send("Invalid Request");
  }
  else {
      const getTweetDataQuery = `
        SELECT 
          tweet.tweet AS tweet,
          COUNT(DISTINCT like.like_id) AS likes,
          COUNT(DISTINCT reply.reply_id) AS replies,
          tweet.date_time AS dateTime
        FROM 
          (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
          INNER JOIN like ON T.tweet_id = like.tweet_id
        WHERE 
          tweet.tweet_id = ${tweetId};
      `;
      const tweetData = await db.all(getTweetDataQuery);
      response.status(200);
      response.send(tweetData);
  }
});

//API 7
app.get("/tweets/:tweetId/likes/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const userIdArray = await db.get(getUserIdQuery);
  console.log(userIdArray);

  const getFollowingTweetQuery = `
    SELECT 
      follower.following_user_id 
    FROM 
      tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE 
      tweet.tweet_id = ${tweetId}
      AND 
      follower.follower_user_id = ${userIdArray.user_id}
  `;
  const followingTweetsArray = await db.all(getFollowingTweetQuery);
  console.log(followingTweetsArray);
  if(followingTweetsArray.length === 0) {
      response.status(401);
      response.send("Invalid Request");
  }
  else {
      const getLikedUsersQuery = `
       SELECT 
        DISTINCT user.username 
       FROM 
        (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS T 
        INNER JOIN user ON T.user_id = user.user_id
       WHERE 
        tweet.tweet_id = ${tweetId}
      `;
      const likedUsersData = await db.all(getLikedUsersQuery);
      let likedUsersArray = [];
      for(let eachUserObj of likedUsersData) {
          likedUsersArray.push(eachUserObj.username);
      }
      response.status(200);
      response.send({"likes" : likedUsersArray});
  }
});

//API 8 
app.get("/tweets/:tweetId/replies/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const userIdArray = await db.get(getUserIdQuery);
  console.log(userIdArray);

  const getFollowingTweetQuery = `
    SELECT 
      follower.following_user_id 
    FROM 
      tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE 
      tweet.tweet_id = ${tweetId}
      AND 
      follower.follower_user_id = ${userIdArray.user_id}
  `;
  const followingTweetsArray = await db.all(getFollowingTweetQuery);
  console.log(followingTweetsArray);
  if(followingTweetsArray.length === 0) {
      response.status(401);
      response.send("Invalid Request");
  }
  else {
      const getRepliedUsersQuery = `
       SELECT 
        user.name,
        reply.reply
       FROM 
        (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T 
        INNER JOIN user ON T.user_id = user.user_id
       WHERE 
        tweet.tweet_id = ${tweetId}
      `;
      const repliedUsersData = await db.all(getRepliedUsersQuery);
      response.status(200);
      response.send({"replies" : repliedUsersData});
  }
});

//API 9 
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const {user_id} = await db.get(getUserIdQuery);
  const getUserTweetsQuery = `
    SELECT 
        tweet.tweet AS tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
    FROM 
        (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
        INNER JOIN like ON T.tweet_id = like.tweet_id
    WHERE 
        tweet.user_id = ${user_id}
    GROUP BY 
       tweet.tweet_id
    `;
    const userTweetsArray = await db.all(getUserTweetsQuery);
    response.status(200);
    response.send(userTweetsArray);
});

//API 10 
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const {tweet} = request; 
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const {user_id} = await db.get(getUserIdQuery);
  const createUserTweetsQuery = `
    INSERT INTO 
     tweet(tweet, user_id)
    VALUES (
        '${tweet}',
        ${user_id}
    )    
    `;
    await db.run(createUserTweetsQuery);
    response.send("Created a Tweet");
});

//API 11 
app.delete("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const {username} = payload;
  const getUserIdQuery =  `
   SELECT 
    user_id 
   FROM 
    user 
   WHERE 
    username = '${username}'
  `;
  const userIdArray = await db.get(getUserIdQuery);
  console.log(userIdArray);

  const deleteTweetQuery = `
    SELECT 
      *
    FROM 
      tweet
    WHERE 
      tweet.tweet_id = ${tweetId}
      AND 
      tweet.user_id = ${userIdArray.user_id}
  `;
  const userTweetsArray = await db.all(deleteTweetQuery);
  console.log(userTweetsArray);
  if(userTweetsArray.length === 0) {
      response.status(401);
      response.send("Invalid Request");
  }
  else {
      const deleteTweetQuery = `
        DELETE FROM tweet 
        WHERE 
          tweet.tweet_id = ${tweetId}
          AND 
          tweet.user_id = ${userIdArray.user_id}
      `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
  }
});

module.exports = app;
