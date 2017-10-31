// Copyright 2017 Google Inc.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const request = require('request');
const Twitter = require('twitter');

// Local data
const config = require('./local.json')

const client = new Twitter(config.twitter);

// Set up BigQuery
// Replace this with the name of your project and the path to your keyfile
const gcloud = require('google-cloud')({
  keyFilename: config.keyfile_path,
  projectId: config.cloud_project_id
});
const bigquery = gcloud.bigquery();
const dataset = bigquery.dataset(config.bigquery_dataset);
const table = dataset.table(config.bigquery_table);

// Replace searchTerms with whatever tweets you want to stream
// Details here: https://dev.twitter.com/streaming/overview/request-parameters#track
const searchTerms = '#google,google,#shop,#pants,#jacket,trump,#trump,narendramodi,halloween';

client.stream('statuses/filter', {track: searchTerms, language: 'en'}, function(stream) {

  stream.on('data', function(event) {
		// Exclude tweets starting with "RT"
   		if ((event.text != undefined) && (event.text.substring(0,2) != 'RT')) {
   			callNLApi(event);
   			console.log(event.text);
   		}

  });

  stream.on('error', function(error) {
    throw error;
  });
});

function callNLApi(tweet) {
	const nlApiUrl = "https://language.googleapis.com/v1beta1/documents:annotateText?key=" + config.nl_api_key

	let requestBody = {
		"document": {
			"type": "PLAIN_TEXT",
			"content": tweet.text
		},
		"features": {
		  "extractSyntax": true,
		  "extractDocumentSentiment": true
		}
	}

	let options = {
		url: nlApiUrl,
		method: "POST",
		body: requestBody,
		json: true
	}

	request(options, function(err, resp, body) {
		if ((!err && resp.statusCode == 200) && (body.sentences.length != 0)) {

			let row = {
			  id: tweet.id_str,
			  text: tweet.text,
			  created_at: tweet.timestamp_ms,
			  user_followers_count: (tweet.user.followers_count),
			  hashtags: JSON.stringify(tweet.entities.hashtags),
			  tokens: JSON.stringify(body.tokens),
			  score: (body.documentSentiment.score).toString(),
			  magnitude: (body.documentSentiment.magnitude).toString(),
			  location: JSON.stringify(tweet.place)
			};

			table.insert(row, function(error, insertErr, apiResp) {
				// console.log(apiResp.insertErrors[0]);
				if (error) {
					console.log('err', error);
				} else if (insertErr.length == 0) {
					console.log('success!');
				}
			});


		} else {
			console.log('NL API error: ', err);
		}
	});
}
