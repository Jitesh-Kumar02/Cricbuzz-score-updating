let matchesLogic = {};

const { default: mongoose, set } = require("mongoose");
const matchCollection = require("../models/matches");
const playerCollection = require("../models/players");

const utils = require("../utils/utils");
const service = require("../service/service");



// create new match
matchesLogic.addNewMatch = async (req, res) => {
    try {
        if(utils.compare(req.body.team1Name, req.body.team2Name)) return res.status(400).send({success: false, error: "Both teams can't be same"});

        let match = matchCollection(req.body);

        let newSet = new Set([...req.body.team1Players, ...req.body.team2Players]);
        if(newSet.size != 22) return res.status(400).send({success: false, error: `Invalid Player ids`});

        let array1 = [], array2 = [];
        for(let index = 0; index < 11; index++) {
            let findPlayer1 = await service.findOne(playerCollection, {_id: new mongoose.Types.ObjectId(req.body.team1Players[index])});
            if(!findPlayer1) return res.status(400).send({success: false, error: `Invalid Player id ${req.body.team1Players[index]}`});
            array1.push({playerId: req.body.team1Players[index], playerName: findPlayer1.firstName});
            
            let findPlayer2 = await service.findOne(playerCollection, {_id: new mongoose.Types.ObjectId(req.body.team2Players[index])});
            if(!findPlayer2) return res.status(400).send({success: false, error: `Invalid Player id ${req.body.team2Players[index]}`});
            array2.push({playerId: req.body.team2Players[index], playerName: findPlayer2.firstName});
        }
        match.team1Players = array1;
        match.team2Players = array2;

        await service.save(match);

        return res.status(200).send({success: true, message: "Match added successfully"});
    } catch(err) {
        return res.status(500).send({success: false, error: err.message || "Internal server error"});
    }
};



// select next bowler
matchesLogic.selectNextBowler = async (req, res) => {
    try {
        let scoreCardTeam, otherTeamPlayers;
        if(req.match.firstTeamBattingComplete) {
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam2" : "scoreCardTeam1";
        } else {
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam1" : "scoreCardTeam2";
        }
        if(scoreCardTeam == "scoreCardTeam2") otherTeamPlayers = "team1Players";
        else otherTeamPlayers = "team2Players";

        let lastBall = req.match[scoreCardTeam][req.match[scoreCardTeam].length-1];
        if(!lastBall) return res.status(400).send({success: false, error: "Select openers first"});
        if(lastBall.bowlerId) return res.status(400).send({success: false, error: "Bowler is already selected"});
        
        let flag = req.match[otherTeamPlayers].some((player) => {
            return player.playerId == req.body.newBowlerId;
        });
        if(!flag) return res.status(400).send({success: false, error: `Invalid bowler id: ${req.body.newBowlerId}`});
        
        let lastBall2 = req.match[scoreCardTeam][req.match[scoreCardTeam].length-2];
        if(lastBall2 && lastBall2.bowlerId == req.body.newBowlerId) return res.status(400).send({success: false, error: "You can not choose the same bolwer again"});

        // update last ball
        service.updateBall(req.body.matchId, matchCollection, scoreCardTeam, lastBall._id, {$set: {[`${scoreCardTeam}.$.bowlerId`]: req.body.newBowlerId}});
        
        return res.status(200).send({success: true, message: "Bowler selected successfully"});
    } catch(err) {
        return res.status(500).send({success: false, error: err.message || "Internal server error"});
    }
}



// select next batsman
matchesLogic.selectNextBatsman = async (req, res) => {
    try {
        if(req.body.newBatsmanId1 == req.body.newBatsmanId2) return res.status(400).send({success: false, error: `Both batsman id can't be same`});
        
        let scoreCardTeam, teamPlayers;
        if(req.match.firstTeamBattingComplete) {
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam2" : "scoreCardTeam1";
            teamPlayers = req.match.firstBattingTeam == 1 ? "team2Players" : "team1Players";
        } else {
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam1" : "scoreCardTeam2";
            teamPlayers = req.match.firstBattingTeam == 1 ? "team1Players" : "team2Players";
        }

        let indexNewBatsman1 = req.match[teamPlayers].findIndex((player)=>{
            return player.playerId == req.body.newBatsmanId1;
        });
        
        if(req.match[scoreCardTeam].length == 0) {
            if(!req.body.newBatsmanId2) return res.status(400).send({success: false, error: `Send two player ids of openers`});
            
            if(indexNewBatsman1 == -1) return res.status(400).send({success: false, error: `Invalid player id ${req.body.newBatsmanId1}`});
            
            let flag = req.match[teamPlayers].some((player)=>{
                return player.playerId == req.body.newBatsmanId2;
            });
            if(!flag) return res.status(400).send({success: false, error: `Invalid player id ${req.body.newBatsmanId2}`});

            await service.findOneAndUpdate(matchCollection, {_id: new mongoose.Types.ObjectId(req.body.matchId)}, {$push: {[`${scoreCardTeam}`]: {playerOnStrikeId: req.body.newBatsmanId1, playerOnNonStrikeId: req.body.newBatsmanId2, overNo: 1, ballNo: 1}}});
            
            return res.status(200).send({success: true, message: "Openers selected successfully"});
        } else {
            if(indexNewBatsman1 == -1) return res.status(400).send({success: false, error: `Invalid player id ${req.body.newBatsmanId1}`});
            
            let lastBall = req.match[scoreCardTeam][req.match[scoreCardTeam].length-1];

            if(lastBall.playerOnStrikeId && lastBall.playerOnNonStrikeId) return res.status(400).send({success: false, error: `Two Batsman are already on crease`});

            if(req.match[teamPlayers][indexNewBatsman1].alreadyBatted) return res.status(400).send({success: false, error: `Player with player id ${req.body.newBatsmanId1} already got out`});

            if(lastBall.playerOnStrikeId == req.body.newBatsmanId1 || lastBall.playerOnNonStrikeId == req.body.newBatsmanId1) return res.status(400).send({success: false, error: `Player with id ${req.body.newBatsmanId1} is already on field`});

            if(!lastBall.playerOnStrikeId) {
                service.updateBall(req.body.matchId, matchCollection, scoreCardTeam, lastBall._id, {$set: {[`${scoreCardTeam}.$.playerOnStrikeId`]: req.body.newBatsmanId1}});
            } else if(!lastBall.playerOnNonStrikeId) {
                service.updateBall(req.body.matchId, matchCollection, scoreCardTeam, lastBall._id, {$set: {[`${scoreCardTeam}.$.playerOnNonStrikeId`]: req.body.newBatsmanId1}});
            }

            return res.status(200).send({success: true, message: "Player selected successfully"});
        }
    } catch(err) {
        return res.status(500).send({success: false, error: err.message || "Internal server error"});
    }
};



// undo last ball and update score
matchesLogic.undoUpdateScore = async (req, res) => {
    try {
        let scoreCardTeam, teamFallOfWickets, teamNo;
        
        if(req.match.firstTeamBattingComplete) {
            teamNo = req.match.firstBattingTeam == 1 ? "2" : "1";
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam2" : "scoreCardTeam1";
            teamFallOfWickets = req.match.firstBattingTeam == 1 ? "team2FallOfWickets" : "team1FallOfWickets";
        } else {
            teamNo = req.match.firstBattingTeam == 1 ? "1" : "2";
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam1" : "scoreCardTeam2";
            teamFallOfWickets = req.match.firstBattingTeam == 1 ? "team1FallOfWickets" : "team2FallOfWickets";
        }

        if(req.match[scoreCardTeam].length == 1) return res.status(400).send({success: false, error: `There is nothing to undo`});

        let lastBall = req.match[scoreCardTeam][req.match[scoreCardTeam].length-1];

        if(req.match.matchComplete) {
            await service.findOneAndUpdate(matchCollection, {_id: new mongoose.Types.ObjectId(req.body.matchId)}, {$set: { matchComplete: false}});
            
            updatePlayerProfile(req, -1);
        } else if(req.match.firstTeamBattingComplete && req.match[scoreCardTeam].length == 0) {
            await service.findOneAndUpdate(matchCollection, {_id: new mongoose.Types.ObjectId(req.body.matchId)}, {$set: { firstTeamBattingComplete: false}});

            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam1" : "scoreCardTeam2";
            teamFallOfWickets = req.match.firstBattingTeam == 1 ? "team1FallOfWickets" : "team2FallOfWickets";
        } else {
            // Removing current ball
            let lastBallId = req.match[scoreCardTeam][req.match[scoreCardTeam].length-1]._id;
            
            await service.findOneAndUpdate(matchCollection, { _id: new mongoose.Types.ObjectId(req.body.matchId)}, { $pull: { [`${scoreCardTeam}`]: { _id: lastBallId}}});
            
            lastBall = req.match[scoreCardTeam][req.match[scoreCardTeam].length-2];
        }
        
        // update team runs
        service.updateTeamRuns(req.body.matchId, matchCollection, teamNo, lastBall.validity == "valid" ? lastBall.runs : lastBall.runs+1, -1);
        
        let decWicketsBowler = 0;
        if(lastBall.wicketPlayerId && lastBall.wicketPlayerId == req.match[teamFallOfWickets][req.match[teamFallOfWickets].length-1]) {
            if(lastBall.wicketType != "runout" && lastBall.wicketType != "hitWicket") decWicketsBowler = -1;
            // update wickets of batsman
            service.updateWicketsBatsman(req.body.matchId, matchCollection, teamNo, lastBall.wicketPlayerId, false);
            // update wicket player id in teamFallOfWickets
            service.updateTeamFallOfWickets(req.body.matchId, matchCollection, teamNo, lastBall.wicketPlayerId, false);
        }


        let decRunsBowler = decRunsBatman = decBallsBowled = decBallsFaced = 0;
        if(lastBall.validity != "valid") decRunsBowler = -1;
        else decBallsBowled = -1;
        if(lastBall.validity != "wide") decBallsFaced = -1;
        if(!lastBall.byes) {decRunsBowler -= lastBall.runs; decRunsBatman = lastBall.runs;}
        // update balls faced and runs of batsman
        service.updateBallsRunsBatsman(req.body.matchId, matchCollection, teamNo, lastBall.playerOnStrikeId, decBallsFaced, lastBall.validity == "wide" ? 0 : decRunsBatman);
        // update runs and balls and wickets of bowler
        service.updateBallsRunsWicketsBowler(req.body.matchId, matchCollection, scoreCardTeam, lastBall.bowlerId, decBallsBowled, decRunsBowler, decWicketsBowler);
        

        // update last ball
        service.updateBall(req.body.matchId, matchCollection, scoreCardTeam, lastBall._id, {$set: {byes: false, runs: undefined, validity: undefined, wicketType: undefined, wicketPlayerId: undefined}});

        matchesLogic.updateScore(req, res);
    } catch(err) {
        return res.status(500).send({success: false, error: err.message || "Internal server error"});
    }
};



// update score
matchesLogic.updateScore = async (req, res) => {
    try {
        req.match = await service.findOne(matchCollection, {_id: req.body.matchId});

        let scoreCardTeam, teamNo, teamName, runs = req.body.runs, validity = req.body.validity, wicketType = req.body.wicketType;
        
        if(req.match.firstTeamBattingComplete) {
            teamNo = req.match.firstBattingTeam == 1 ? "2" : "1";
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam2" : "scoreCardTeam1";
            teamName = req.match.firstBattingTeam == 1 ? "team2Name" : "team1Name";
        } else {
            teamNo = req.match.firstBattingTeam == 1 ? "1" : "2";
            scoreCardTeam = req.match.firstBattingTeam == 1 ? "scoreCardTeam1" : "scoreCardTeam2";
            teamName = req.match.firstBattingTeam == 1 ? "team1Name" : "team2Name";
        }
        
        // check if two openers are selected
        if(req.match[scoreCardTeam].length == 0) return res.status(400).send({success: false, error: `Select Openers of ${req.match[teamName]}`});
        
        let lastBall = req.match[scoreCardTeam][req.match[scoreCardTeam].length-1];
        
        // check if two batsmen are selected
        if(!lastBall.playerOnStrikeId || !lastBall.playerOnNonStrikeId) return res.status(400).send({success: false, error: "Please Select the next batsman"});

        // check if bowler selected
        if(!lastBall.bowlerId) return res.status(400).send({success: false, error: "Please Select the bowler"});
  
        // if run out check validity of wicketPlayerId
        if(wicketType == "runout" && !(lastBall.playerOnStrikeId == req.body.wicketPlayerId || lastBall.playerOnNonStrikeId == req.body.wicketPlayerId)) return res.status(400).send({success: false, error: "Invalid wicket player id"});
        
        // Out
        let wicketsBowler = 0, wicketBatsmanId, ballsBowled = 0, ballsFaced = 1, nextBallFreeHit = false, newPlayerOnStrikeId = lastBall.playerOnStrikeId, newPlayerOnNonStrikeId = lastBall.playerOnNonStrikeId;
        if((validity == "noball" || lastBall.freeHit) && wicketType != "runout") {
            wicketType = undefined;
            req.body.wicketPlayerId = undefined;
        }
        if(validity == "valid") {
            ballsBowled = 1;
            if(wicketType && wicketType != "runout") {
                if(lastBall.freeHit) {
                    if(wicketType == "stumped") runs = 0;
                } else {
                    runs = 0;
                    wicketBatsmanId = newPlayerOnStrikeId;
                    if(wicketType != "hitwicket") wicketsBowler = 1;
                    newPlayerOnStrikeId = undefined;
                }
            }
        } else if(validity == "wide") {
            req.body.byes = false;
            if(lastBall.freeHit) nextBallFreeHit = true;
            ballsFaced = 0;
            if(wicketType == "stumped") wicketsBowler = 1;
            if(wicketType == "stumped" || wicketType == "hitwicket") {
                runs = 0;
                wicketBatsmanId = newPlayerOnStrikeId;
                newPlayerOnStrikeId = undefined;
            }
        }
        if(wicketType == "runout") {
            if(newPlayerOnStrikeId == req.body.wicketPlayerId) {
                wicketBatsmanId = newPlayerOnStrikeId;
                newPlayerOnStrikeId = undefined;
            }
            else {
                wicketBatsmanId = newPlayerOnNonStrikeId;
                newPlayerOnNonStrikeId = undefined;
            }
        }
        if(!wicketBatsmanId) {
            wicketType = undefined;
            req.body.wicketPlayerId = undefined;
        }
        else {
            service.updateTeamFallOfWickets(req.body.matchId, matchCollection, teamNo, wicketBatsmanId, true);
            service.updateWicketsBatsman(req.body.matchId, matchCollection, teamNo, wicketBatsmanId, true);
        }


        // update team runs
        service.updateTeamRuns(req.body.matchId, matchCollection, teamNo, validity == "valid" ? runs : runs+1, 1);
        
        // update runs and balls and wickets of bowler and batsman
        if(!req.body.byes) {
            service.updateBallsRunsWicketsBowler(req.body.matchId, matchCollection, scoreCardTeam, lastBall.bowlerId, ballsBowled, (validity == "valid" ? runs : runs+1), wicketsBowler);

            service.updateBallsRunsBatsman(req.body.matchId, matchCollection, teamNo, lastBall.playerOnStrikeId, ballsFaced, validity == "wide" ? 0 : runs);
        } else {
            service.updateBallsRunsWicketsBowler(req.body.matchId, matchCollection, scoreCardTeam, lastBall.bowlerId, ballsBowled, (validity == "valid" ? 0 : 1), 0);
            
            service.updateBallsRunsBatsman(req.body.matchId, matchCollection, teamNo, lastBall.playerOnStrikeId, ballsFaced, 0);
        }


        // update lastBall
        service.updateBall(req.body.matchId, matchCollection, scoreCardTeam, lastBall._id, {$set: {[`${scoreCardTeam}.$.validity`]: validity, [`${scoreCardTeam}.$.runs`]: runs, [`${scoreCardTeam}.$.byes`]: (req.body.byes) ? true : false, [`${scoreCardTeam}.$.wicketType`]: wicketType, [`${scoreCardTeam}.$.wicketPlayerId`]: wicketBatsmanId}});
        

        // Strike rotate
        if(runs % 2) [newPlayerOnStrikeId, newPlayerOnNonStrikeId] = [newPlayerOnNonStrikeId, newPlayerOnStrikeId];

        // Select next over no and next ball no and bowlerId
        let nextOverNo, nextBallNo, newBowlerId = lastBall.bowlerId;
        if(validity == "valid") {
            if(lastBall.ballNo == 6) {
                nextOverNo = lastBall.overNo + 1;
                nextBallNo = 1;
                newBowlerId = undefined;
            } else {
                nextOverNo = lastBall.overNo;
                nextBallNo = lastBall.ballNo + 1;
            }
        } else {
            nextOverNo = lastBall.overNo;
            nextBallNo = lastBall.ballNo;
        }

        
        // Innigs complete or match finished
        if(nextOverNo > req.match.totalOvers) {
            let message;
            if(req.match.firstTeamBattingComplete) {
                await service.findOneAndUpdate(matchCollection, {_id: new mongoose.Types.ObjectId(req.body.matchId)}, {$set: {matchComplete: true}});
                message = "Score updated and innings break";

                updatePlayerProfile(req, 1);
            } else {
                await service.findOneAndUpdate(matchCollection, {_id: new mongoose.Types.ObjectId(req.body.matchId)}, {$set: {firstTeamBattingComplete: true}});
                message = "Score updated and match finished";
            }
            return res.status(200).send({success: true, message});
        }
        
        
        // add new ball
        if(validity == "noball") nextBallFreeHit = true;
        await service.findOneAndUpdate(matchCollection, {_id: new mongoose.Types.ObjectId(req.body.matchId)}, {$push: {[`${scoreCardTeam}`]: {playerOnStrikeId: newPlayerOnStrikeId, playerOnNonStrikeId: newPlayerOnNonStrikeId, overNo: nextOverNo, ballNo: nextBallNo, bowlerId: newBowlerId, freeHit: nextBallFreeHit}}});


        return res.status(200).send({success: true, message: "Score updated successfully"});
    } catch(err) {
        return res.status(500).send({success: false, error: err.message || "Internal server error"});
    }
};



const updatePlayerProfile = async (req, multiply) => {
    try{
        let match = await service.findOne(matchCollection, {_id: new mongoose.Types.ObjectId(req.body.matchId)});
        if(match) {
            for(let index = 0; index < 11; index++) {
                await service.findOneAndUpdate(playerCollection, {_id: new mongoose.Types.ObjectId(match.team1Players[index].playerId)}, {$inc: {runs: multiply*match.team1Players[index].playerRuns, wickets: multiply*match.team1Players[index].playerWickets}})
                await service.findOneAndUpdate(playerCollection, {_id: new mongoose.Types.ObjectId(match.team2Players[index].playerId)}, {$inc: {runs: multiply*match.team2Players[index].playerRuns, wickets: multiply*match.team2Players[index].playerWickets}});
            }
        }
    } catch(err) {
        return;
    }
}



// fetch all matches
matchesLogic.fetchMatches = async (req, res) => {
    try {
        let allMatches = await matchCollection.aggregate([
            {
                $addFields: {id: "$_id"}
            },
            {
                $project: {_id: 0, __v: 0, "team1Players._id": 0, "scoreCardTeam1._id": 0, "scoreCardTeam2._id": 0, "team2Players._id": 0}
            },
        ]);

        return res.status(200).send({success: true, matches: allMatches});
    } catch(err) {
        return res.status(500).send({success: false, error: err.message || "Internal server error"});
    }
};

module.exports = matchesLogic;



// let all_matches = await matchCollection.aggregate([
//     {
//         $match: {
//             "_id": new mongoose.Types.ObjectId(req.body._id),
//             "scoreCard_team1.over_no": 1
//         }
//     },
//     {
//         $project: {scoreCard_team1: 1, _id: 0}
//     }
// ]);
