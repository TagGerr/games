const socket = io.connect('cards.taggedltd.com');
const PLAYER_TIME = 60;

let player = null,
    gameHandler = null,
    app = document.getElementById('page_app'),
    prepareGame = () => {
        if(player !== null){
            if(typeof player.game !== 'undefined'){
                switch(player.game.id){
                    case 'jkh':
                        gameHandler = new JkhHandler(player, app, socket);
                        break;
            
                    default:
                        player = null;
                        return;
                }
            }

            if( sessionStorage ){
                let storedPlayer = {id: player.id, timestamp: (new Date()).getTime()};
                sessionStorage.setItem('jkhPlayer', JSON.stringify(storedPlayer));
            }
        }
    };

let setUpGameRoom = function() {
    app.innerHTML = `
        <div class="col-md-6 offset-md-3 mt-4 shadow-box">
            <h4>Game joined!</h4>
            <p>Room code is ${player.room}</p>

            <ul id="room_player_list" class="list-group mb-5"></ul>

            <div id="first_player_control">
                <button type="button" id="start_button" class="btn btn-success form-control">Start Game</button>
                <hr />
            </div>
            <button type="button" id="leave_button" class="btn btn-danger form-control">Leave Game</button>
        </div>
    `;

    document.getElementById('leave_button').addEventListener('click', () => {
        socket.emit('leave-game');
    });

    document.getElementById('start_button').addEventListener('click', () => {
        socket.emit('game-event', 'start');
    });
};

let showFirstPlayerControl = function() {
    let controlElements = document.getElementById('first_player_control'),
        firstPlayer = document.querySelector('#room_player_list li.player:first-child');
    if( controlElements && firstPlayer ){
        controlElements.style.display = (firstPlayer.dataset.playerId === player.id) ? 'block' : 'none';
    }
};

let showChatMessage = function(message, playerName) {
    const chatBox = document.getElementById('chat_box');
    if( chatBox ){
        chatBox.innerHTML += `
            <p>
                <span class="blue">${playerName}:</span>
                ${message}
            </p>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;
    }
};

socket.on('welcome', data => {
    app.innerHTML = `
        <form class="col-md-6 offset-md-3 mt-4 shadow-box">
            <div class="form-group">
                <label for="player_name">What should we call you?</label>
                <input type="text" class="form-control" id="player_name" placeholder="Player Name">
            </div>
            <button type="submit" id="choose_button" class="btn btn-primary form-control">Play Game</button>
        </form>

        <div class="modal fade" id="reconnect_modal" data-backdrop="static" tabindex="-1" role="dialog" aria-labelledby="reconnect_modal_label" aria-hidden="true">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h4 class="modal-title" id="reconnect_modal_label">Did you get disconnected?</h4>
                    </div>

                    <div class="modal-body pt-2">
                        <p>It looks like you may have been in a game earlier.</p>
                        <p>Do you want to try reconnecting to the game?</p>
                    </div>

                    <div class="modal-footer">
                        <button class="btn btn-light mt-3 mb-2" data-dismiss="modal" id="cancel_reconnect_button">No, thanks</button>
                        <button class="btn btn-primary mt-3 mb-2 ml-auto" data-dismiss="modal" id="reconnect_player_button">Try reconnecting</button>
                    </div>
                </div>
            </div>
        </div>
`;

    let nameInput = document.getElementById('player_name');

    nameInput.value = data.suggested_name;

    document.getElementById('choose_button').addEventListener('click', (event) => {
        event.preventDefault();
        socket.emit('choose-game', nameInput.value, 'jkh');
    });

    if( sessionStorage ){
        let existingPlayer = sessionStorage.getItem('jkhPlayer'),
            removeStoredPlayer = () => sessionStorage.removeItem('jkhPlayer');
        if( existingPlayer !== null){
            existingPlayer = JSON.parse(existingPlayer);
            if(existingPlayer.timestamp >= (new Date()).getTime() - 30 * 60 * 1000){
                let reconnectModal = document.getElementById('reconnect_modal');
                reconnectModal.querySelector('#reconnect_player_button').addEventListener('click', () => socket.emit('reconnect-player', existingPlayer.id));
                reconnectModal.querySelector('#cancel_reconnect_button').addEventListener('click', removeStoredPlayer());
                $(reconnectModal).modal('show');
            } else {
                removeStoredPlayer();
            }
        }
    }
});

socket.on('player-update', playerData => {
    player = playerData;
    if(typeof player.game !== 'undefined' && gameHandler === null){
        prepareGame();
    }
})

socket.on('chose-game', () => {
    prepareGame();

    app.innerHTML = `
        <div class="col-md-6 offset-md-3 mt-4 shadow-box">
            <h4>Welcome, ${player.name}</h4>
            
            <div class="mt-4">
                <h5>Join an existing game</h5>
                <ul id="open_games_list" class="list-group"></ul>
            </div>

            <div class="rule-separator">OR</div>

            <div class="mt-4">
                <h5>Start a new game</h5>
                <label>Points to win:</label>
                <div class="btn-group" data-toggle="buttons">
                    <label class="btn">
                        <input type="radio" name="points" id="points_3" autocomplete="off" value="3"> 3
                    </label>
                    <label class="btn active">
                        <input type="radio" name="points" id="points_5" autocomplete="off" value="5" checked> 5
                    </label>
                    <label class="btn">
                        <input type="radio" name="points" id="points_10" autocomplete="off" value="10"> 10
                    </label>
                </div>
                <button type="button" id="create_button" class="btn btn-success form-control">Create Game</button>
            </div>
        </div>
`;

    document.getElementById('create_button').addEventListener('click', () => {
        const options = {};
        const pointsElement = document.querySelector('input[name="points"]:checked');
        if( pointsElement ){
            options.points = parseInt(pointsElement.value);
        }
        console.log(options);
        socket.emit('create-game', options);
    });
});

socket.on('open-games', games => {
    let openGamesList = document.getElementById('open_games_list');
    if( openGamesList ){
        let openGames = '',
            gameEntries = Object.entries(games);
        
        if(gameEntries.length > 0){
            for(let [room, game] of Object.entries(games)){
                openGames += `
                    <li class="list-group-item" data-room="${room}">
                        ${room} <span class="float-right">Players ${game.players}/${game.maxPlayers}</span>
                    </li>
                `;
            }
        } else {
            openGames = `
                <li class="list-group-item text-muted text-center">
                    No open games
                </li>
            `;
        }
        openGamesList.innerHTML = openGames;

        openGamesList.querySelectorAll('.list-group-item[data-room]').forEach(gameItem => {
            gameItem.addEventListener('click', () => {
                socket.emit('join-game', gameItem.dataset.room);
            });
        });
    }
});

socket.on('created-game', () => {
    setUpGameRoom();

    let playerList = document.getElementById('room_player_list');
    playerList.innerHTML = `
        <li data-player-id="${player.id}" class="list-group-item d-flex justify-content-between align-items-baseline">
            ${player.name}
            <span class="badge badge-info badge-pill">You</span>
        </li>`;
    
    showFirstPlayerControl();
});

socket.on('joined-game', players => {
    setUpGameRoom();

    let playerList = document.getElementById('room_player_list');
    let playerItems = '';
    for(let p of players){
        playerItems += `
            <li data-player-id="${p.id}" class="player list-group-item d-flex justify-content-between align-items-baseline">
                ${p.name}
                <div class="disconnect-bubbles">
                    <div class="bounce1"></div>
                    <div class="bounce2"></div>
                    <div class="bounce3"></div>
                </div>
                ${player.id === p.id ? '<span class="badge badge-info badge-pill">You</span>' : ''}
            </li>`;
    }
    playerList.innerHTML = playerItems;

    showFirstPlayerControl();
});

socket.on('player-joined', player => {
    let playerList = document.getElementById('room_player_list');
    if(playerList){
        playerList.innerHTML += `
            <li data-player-id="${player.id}" class="player list-group-item d-flex justify-content-between align-items-baseline">
                ${player.name}
                <div class="disconnect-bubbles">
                    <div class="bounce1"></div>
                    <div class="bounce2"></div>
                    <div class="bounce3"></div>
                </div>
            </li>`;
    }

    showFirstPlayerControl();
});

socket.on('player-disconnecting', player => {
    let playerItem = document.querySelector(`[data-player-id="${player.id}"]`);
    if( playerItem ){
        playerItem.classList.add('disconnecting');
    }
});

socket.on('player-reconnected', ids => {
    let playerItem = document.querySelector(`[data-player-id="${ids.oldId}"]`);
    if( playerItem ){
        playerItem.dataset.playerId = ids.newId;
        playerItem.classList.remove('disconnecting');
    }
});

socket.on('player-left', playerData => {
    let playerItem = document.querySelector(`[data-player-id="${playerData.id}"]`);
    if(playerItem){
        let parent = playerItem.parentElement,
            item = playerItem;

        if( item.classList.contains('card') ){
            item = parent;
            parent = item.parentElement;
        }
        
        parent.removeChild(item);
        showFirstPlayerControl();
    }
});

socket.on('join-failed', error => {
    alert(`Unable to join this game: ${error.message}`);
});

socket.on('received-chat', showChatMessage);

socket.on('game-data', (message, ...data) => {
    gameHandler.handleMessage(message, data);
});
