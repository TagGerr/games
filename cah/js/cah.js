class CahHandler {
    constructor(player, app, socket) {
        this.player = player;
        this.app = app;
        this.socket = socket;

        this.maxPoints = 0;
        this.isCzar = false;
        this.trashedCards = false;
        this.blackCardText = '';

        this.timerInterval = null;
    }

    handleMessage(message, data) {
        switch(message){
            case 'game-wait':
                this.setGameReady(false);
                break;
            
            case 'game-ready':
                this.setGameReady(true);
                break;
    
            case 'start-failed':
                alert(`Can't start game: ${data[0]}!`);
                break;
    
            case 'game-started':
                this.startGame(...data);
                break;
    
            case 'game-reconnected':
                this.catchUpPlayer(...data);
                break;

            case 'round-start':
                this.showCzar(...data);
                break;
                
            case 'czar-wait':
                this.loadCzarScreen(...data);
                break;
            
            case 'cards-dealt':
                this.loadPlayerCards(...data);
                break;
    
            case 'cards-played':
                this.loadPlayedCards(...data);
                break;

            case 'selected-card':
                this.showWinningCards(...data);
                break;
            
            case 'update-scores':
                this.updatePlayerScores(...data);
                break;
                
            case 'game-won':
                this.showWinner(...data);
                break;

            case 'cards-chosen':
                this.showPlayerReady(...data);
                break;
    
            default:
                // console.log('The game speaks!', message, data);
                break;
        }
    }

    setGameReady(ready) {
        setTimeout(() => {
            let startButton = document.getElementById('start_button');
            if(startButton){
                startButton.disabled = !ready;
            }
        }, 5);
    }

    setCardTable() {
        this.app.innerHTML = `
            <section class="shadow-box">
                <p class="lead text-center mb-0">The Table</p>
                <p class="czar-timer text-center small mb-0">
                    (Time Left: <span class="seconds"></span>s)
                </p>
                <div id="black_area" class="row"></div>
            </section>

            <section class="shadow-box clearfix">
                <p class="lead text-center mb-0">Your Cards</p>
                <p class="player-timer text-center small mb-0">
                    (Time Left: <span class="seconds"></span>s)
                </p>
                <div id="white_area" class="row"></div>
                <button type="button" id="trash_button" class="btn btn-danger pull-right mt-2">Trash Cards</button>
            </section>
            
            <section class="shadow-box">
                <p class="lead text-center mb-0">The Players</p>
                <div id="player_area" class="row"></div>
            </section>

            <section class="shadow-box">
                <p class="lead text-center mb-0">Chat Box</p>
                <div id="chat_box"></div>
                <div class="input-group">
                    <input type="text" id="chat_text" class="form-control">
                    <span class="input-group-btn">
                        <button id="chat_send" class="btn btn-primary" type="button">
                            <i class="fa fa-paper-plane"></i>
                        </button>
                    </span>
                </div>
            </section>
                
            <div class="modal fade" id="winner_modal" data-backdrop="static" tabindex="-1" role="dialog" aria-labelledby="winner_modal_label" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h4 class="modal-title" id="winner_modal_label">Point: <span class="name"></span>!</h4>
                        </div>

                        <div class="modal-body pt-2"></div>

                        <div class="modal-footer">
                            <button class="btn btn-primary mt-3 mb-2" data-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('chat_text').addEventListener('keydown', event => {
            if(event.keyCode === 13){
                event.preventDefault();
                this.sendMessage();
            }
        });
        document.getElementById('chat_send').addEventListener('click', () => this.sendMessage());
        document.getElementById('trash_button').addEventListener('click', () => {
            if( !this.trashedCards ){
                this.trashedCards = true;
                const trashButton = document.getElementById('trash_button');
                this.socket.emit('game-event', 'trash-cards');
                trashButton.parentNode.removeChild(trashButton);
            }
        });
    }
    
    startGame(players, maxPoints) {
        this.maxPoints = maxPoints;
        this.trashedCards = false;
        this.setCardTable();
        this.updatePlayerScores(players);
    }

    catchUpPlayer(gameData) {
        this.startGame(gameData.players, gameData.maxPoints);
        this.showCzar(gameData.czar);

        if(gameData.czar === this.player.id){
            this.loadCzarScreen(gameData.blackCard);
        } else {
            this.loadPlayerCards(gameData.blackCard, [...gameData.selectedCards, ...gameData.hand], gameData.selectedCards);
        }

        if(typeof gameData.playedCards !== 'undefined'){
            this.loadPlayedCards(gameData.playedCards);
        }
    }

    showCzar(czarId) {
        let playerArea = document.getElementById('player_area');
        if( playerArea ){
            playerArea.querySelectorAll('.player.judge').forEach(card => card.classList.remove('judge'));
            playerArea.querySelector(`.player[data-player-id="${czarId}"]`).classList.add('judge');
        }

        this.clearPlayerReady();
    }

    showPlayerReady({id: playerId}) {
        let playerArea = document.getElementById('player_area');
        if( playerArea ){
            playerArea.querySelector(`[data-player-id="${playerId}"]`).classList.add('ready');
        }
    }

    clearPlayerReady() {
        document.getElementById('player_area')
            .querySelectorAll('.player.ready')
            .forEach(element => element.classList.remove('ready'));
    }

    startTimer(callback, type = 'player', ticks = PLAYER_TIME, interval = 1000) {
        clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            ticks -= 1;
            this.updateTimer(ticks, type);
            if(ticks <= 0){
                this.stopTimer(type);
                callback();
            }
        }, interval);

        this.updateTimer(ticks, type);
    }

    stopTimer(type = 'player') {
        this.updateTimer(0, type);
    }

    updateTimer(seconds, type = 'player') {
        if(seconds <= 0){
            clearInterval(this.timerInterval);
        }

        let timerElement = document.querySelector(`.shadow-box .${type}-timer`);
        if( timerElement ){
            if(seconds > 0){
                timerElement.style.display = 'block';
                timerElement.querySelector('.seconds').innerHTML = seconds;

                if(seconds > 10 && timerElement.classList.contains('text-danger')){
                    timerElement.classList.remove('text-danger');
                } else if(seconds <= 10 && !timerElement.classList.contains('text-danger')){
                    timerElement.classList.add('text-danger');
                }
            } else {
                timerElement.style.display = 'none';
            }
        }
    }
    
    loadBlackCard(blackCard) {
        this.stopTimer('czar');
        let blackArea = document.getElementById('black_area');

        this.blackCardText = blackCard.text.replace(/_/g, '<span class="card-blank"></span>');

        if( blackArea ){
            blackArea.innerHTML = `
                <div class="card game-card cah-black">
                    <div class="card-body">
                        <div class="card-title">
                            ${this.blackCardText}
                        </div>
                        <div class="card-help ${blackCard.play !== 1 ? 'visible' : ''}">
                            Play <span class="number">${blackCard.play}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if( this.isCzar ){
            blackArea.innerHTML += `
                <div class="czar-note">You are the Czar.<br />Once everyone has chosen a card to play, they will appear here.</div>
            `;
        }
    }
    
    loadCzarScreen(blackCard) {
        this.isCzar = true;
        this.loadBlackCard(blackCard);
        document.getElementById('white_area').parentElement.style.display = 'none';
    }
    
    loadPlayerCards(blackCard, hand, cardsToPlay = []) {
        this.isCzar = false;
        this.loadBlackCard(blackCard);
    
        let whiteArea = document.getElementById('white_area');
        if(whiteArea){
            whiteArea.parentElement.style.display = 'block';
            whiteArea.innerHTML = '';
            hand.forEach((card, idx) => {
                whiteArea.innerHTML += `
                    <div class="card game-card cah-white" data-index="${idx}">
                        <div class="card-body">
                            <div class="card-title">
                                ${card.text}
                            </div>
                        </div>
                    </div>
                `;
            });

            let cards = whiteArea.querySelectorAll('.game-card.cah-white');

            if(cardsToPlay.length > 0){
                cardsToPlay.forEach((c, idx) => cards[idx].classList.add('selected'));
            } else {
                this.startTimer(() => {
                    [...cards].slice(0, blackCard.play).forEach(c => c.click());
                });
            }
    
            for(let card of cards){
                card.addEventListener('click', event => {
                    if(cardsToPlay.length >= blackCard.play){
                        return;
                    }
    
                    let index = card.dataset.index;
                    card.classList.add('selected');
    
                    cardsToPlay.push(hand[ index ]);
                    if(cardsToPlay.length === blackCard.play){
                        this.stopTimer();
                        this.socket.emit('game-event', 'play-card', cardsToPlay);
                    }
                });
            }
        }
    }
    
    loadPlayedCards(playedCards) {
        document.getElementById('white_area').parentElement.style.display = 'none';

        document.getElementById('player_area')
            .querySelectorAll('.player.ready')
            .forEach(element => element.classList.remove('ready'));
    
        let blackArea = document.getElementById('black_area');
        if(blackArea){
            let czarNote = blackArea.querySelector('.czar-note');
            if(czarNote){
                blackArea.removeChild(czarNote);
            }
            playedCards.forEach((cards, idx) => {
                let showCounter = cards.length > 1;
                cards.forEach((card, count) => {
                    blackArea.innerHTML += `
                        <div class="card game-card cah-white" data-index="${idx}">
                            <div class="card-body">
                                <div class="card-title">
                                    ${card.text}
                                </div>
                                <div class="card-count ${showCounter ? 'visible' : ''}">
                                    ${count + 1}
                                </div>
                            </div>
                        </div>
                    `;
                });
            });
    
            let cards = blackArea.querySelectorAll('.game-card.cah-white');
            for(let card of cards){
                card.addEventListener('click', event => {
                    this.stopTimer('czar');
                    let index = card.dataset.index;
                    this.socket.emit('game-event', 'select-card', playedCards[ index ][0]);
                });
            }

            if( this.isCzar ){
                this.startTimer(() => {
                    cards[0].click();
                }, 'czar', Math.max(cards.length * 10, PLAYER_TIME));
            }
        }
    }

    showWinningCards(cards, player) {
        let winnerModal = document.getElementById('winner_modal');

        if( winnerModal ){
            winnerModal.querySelector('.modal-body').innerHTML = this.blackCardText;
            winnerModal.querySelector('.modal-title .name').innerText = player.name;

            let cardSpaces = winnerModal.querySelectorAll('.modal-body .card-blank');
            cards.forEach((card, idx) => {
                if(typeof cardSpaces[ idx ] !== 'undefined'){
                    cardSpaces[ idx ].innerHTML = card.text.replace(/\.$/, '');
                } else {
                    winnerModal.querySelector('.modal-body').innerHTML += `<br /><span class="card-blank">${card.text}</span>`;
                }
            });

            $(winnerModal).modal('show');
        }
    }
    
    updatePlayerScores(players) {
        let playerArea = document.getElementById('player_area');
    
        if(playerArea){
            playerArea.innerHTML = '';
            for(const player of players){
                playerArea.innerHTML += `
                    <div class="col-md-3 mt-4">
                        <div data-player-id="${player.id}" class="card player ${this.player.id === player.id ? 'self' : ''}">
                            <div class="card-body pb-2">
                                <h6 class="card-title">
                                    ${player.name}
                                    <div class="disconnect-bubbles">
                                        <div class="bounce1"></div>
                                        <div class="bounce2"></div>
                                        <div class="bounce3"></div>
                                    </div>
                                </h6>
                                <div class="card-subtitle d-flex">
                                    <div class="self-badge badge badge-info badge-pill mr-2 align-self-center">
                                        You
                                    </div>
                                    <div class="judge-badge badge badge-dark badge-pill mr-2 align-self-center">
                                        Czar
                                    </div>
                                    <div class="ready-badge badge badge-success badge-pill mr-2 align-self-center">
                                        Ready
                                    </div>
                                    <div class="p-2 h4 mb-0 ml-auto">
                                        ${player.score}/${this.maxPoints}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }

    showWinner(players) {
        let names = players.map(p => p.name).join(' and ');
        this.app.innerHTML += `
            <div class="dark-overlay">
                <div class="card winner-card">
                    <div class="card-body">
                        <h3 class="card-title">
                            ${names} win${players.length === 1 ? 's' : ''}!
                        </h3>
                        <div class="row">
                            <div class="col-6 offset-3">
                                <button id="quit_button" class="btn btn-danger">Quit</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('quit_button').addEventListener('click', () => {
            this.socket.emit('leave-game');
        });
    }

    sendMessage() {
        const messageField = document.getElementById('chat_text');
        if( messageField ){
            const message = messageField.value.trim();
            if(message.length > 0){
                showChatMessage(message, this.player.name);
                this.socket.emit('send-chat', message);
            }
            messageField.value = '';
        }
    }
}