class JkhHandler {
    constructor(player, app, socket) {
        this.player = player;
        this.app = app;
        this.socket = socket;

        this.maxPoints = 0;
        this.roundStyle = 'regular';
        this.isJudge = false;

        this.fullComic = '';
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
                this.showJudge(...data);
                break;
                
            case 'judge-bonus':
            case 'player-bonus':
                this.prepareBonusRound((message === 'judge-bonus'), ...data);
                break;

            case 'judge-setup':
                this.pickSetupCard(...data);
                break;

            case 'player-wait':
                this.loadPlayerCards(...data);
                break;

            case 'joke-setup':
                this.showJokeSetup(...data);
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

            case 'cards-dealt':
                this.updatePlayerCards(...data);
                break;
    
            default:
                // console.log('The game speaks!', message, data);
        }
    }
    
    setGameReady(ready) {
        setTimeout(() => {
            const startButton = document.getElementById('start_button');
            if(startButton){
                startButton.disabled = !ready;
            }
        }, 5);
    }

    setCardTable() {
        this.app.innerHTML = `
            <section class="shadow-box">
                <p class="lead text-center mb-0">The Comic</p>
                <p class="judge-timer text-center small mb-0">
                    (Time Left: <span class="seconds"></span>s)
                </p>
                <div id="comic_area" class="row"></div>
            </section>

            <section class="shadow-box clearfix">
                <p class="lead text-center mb-0">Your Hand</p>
                <p class="player-timer text-center small mb-0">
                    (Time Left: <span class="seconds"></span>s)
                </p>
                <div id="card_area" class="row"></div>
                <button type="button" id="trash_button" class="btn btn-danger pull-right mt-2">Trash Cards</button>
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
        
            <section class="shadow-box">
                <p class="lead text-center mb-0">The Players</p>
                <div id="player_area" class="row"></div>
            </section>

            <div class="modal fade" id="winner_modal" data-backdrop="static" tabindex="-1" role="dialog" aria-labelledby="winner_modal_label" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h4 class="modal-title" id="winner_modal_label">Point: <span class="name"></span>!</h4>
                        </div>

                        <div class="modal-body pt-2 d-flex"></div>

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
        this.showJudge(gameData.judge);

        const playerIsJudge = gameData.judge === this.player.id;
        const alreadyPlayed = gameData.selectedCards.length > 0;

        if(gameData.roundStyle === 'bonus'){
            this.prepareBonusRound(playerIsJudge, gameData.introCard, [...gameData.selectedCards, ...gameData.hand], alreadyPlayed);
        } else {
            this.loadPlayerCards(gameData.introCard, [...gameData.selectedCards, ...gameData.hand], playerIsJudge);

            if(typeof gameData.setupCard !== 'undefined'){
                this.showJokeSetup(gameData.setupCard, alreadyPlayed);
            } else if( playerIsJudge ){
                this.pickSetupCard(gameData.introCard, gameData.hand);
            }
        }

        if(typeof gameData.playedCards !== 'undefined'){
            this.loadPlayedCards(gameData.playedCards);
        }
    }

    showJudge(judgeId) {
        const playerArea = document.getElementById('player_area');
        if( playerArea ){
            playerArea.querySelectorAll('.player.judge').forEach(card => card.classList.remove('judge'));
            playerArea.querySelector(`[data-player-id="${judgeId}"]`).classList.add('judge');
        }

        this.clearPlayerReady();
    }

    showPlayerReady({id: playerId}) {
        const playerArea = document.getElementById('player_area');
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

        const timerElement = document.querySelector(`.shadow-box .${type}-timer`);
        if( timerElement ){
            if(seconds > 0){
                let secondsString = seconds;
                if(seconds > 60){
                    const mins = Math.floor(seconds / 60);
                    const secs = seconds % 60;
                    secondsString = `${mins}m ${secs}`;
                }
                timerElement.style.display = 'block';
                timerElement.querySelector('.seconds').innerHTML = secondsString;

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

    updatePlayerCards(hand) {
        const comicArea = document.getElementById('comic_area');
        const cardArea = document.getElementById('card_area');

        this.stopTimer();
        this.stopTimer('judge');
        this.player.hand = hand;

        if( cardArea ){
            cardArea.innerHTML = '';
            hand.forEach((card, idx) => {
                cardArea.innerHTML += `
                    <div class="card game-card jkh-card" data-index="${idx}" data-color="${card.color}">
                        <img src="${card.image}" />
                    </div>
                `;
            });

            if( this.isJudge ){
                this.setupJudgeEvents(comicArea, cardArea);
            } else if(this.roundStyle === 'bonus') {
                this.setupBonusEvents(cardArea);
            } else if(comicArea.querySelectorAll('.jkh-card').length === 2){
                this.setupPlayerEvents(cardArea);
            }
        }
    }

    removeTempCards(container) {
        container
            .querySelectorAll('.jkh-temp')
            .forEach(temp => container.removeChild(temp));
    }

    setupBonusEvents(cardArea) {
        const cards = cardArea.querySelectorAll('.card.jkh-card');
        let cardsToPlay = [];

        this.startTimer(() => {
            [...cardArea.querySelectorAll('.jkh-card[data-color="black"]')]
                .slice(0, 2)
                .forEach(c => c.click());
        });

        for(const card of cards){
            card.addEventListener('click', event => {
                if(cardsToPlay.length >= 2){
                    return;
                }

                const index = card.dataset.index;

                if(this.player.hand[ index ].color === 'red'){
                    return;
                }

                const chosenIndex = cardsToPlay.findIndex(c => c.id === this.player.hand[ index ].id);
                if(chosenIndex !== -1){
                    card.classList.remove('selected');
                    cardsToPlay.splice(chosenIndex, 1);
                    return;
                }

                card.classList.add('selected');

                cardsToPlay.push(this.player.hand[ index ]);
                if(cardsToPlay.length === 2){
                    this.socket.emit('game-event', 'play-card', cardsToPlay);
                    this.stopTimer();
                }
            });
        }
    }

    setupJudgeEvents(comicArea, cardArea) {
        let sentSelection = false;

        const selected = {
            card: null,
            position: null
        };

        const chooseSetupCard = () => {
            sentSelection = true;
            this.stopTimer('judge');
            this.socket.emit('game-event', 'setup-comic', selected.card, selected.position);

            this.removeTempCards(comicArea);

            const setupDisplay = `
                <div class="card game-card jkh-card">
                    <img src="${selected.card.image}" />
                </div>
            `;

            if(selected.position === 'before'){
                comicArea.innerHTML = setupDisplay + comicArea.innerHTML;
            } else {
                comicArea.innerHTML += setupDisplay;
            }

            comicArea.innerHTML += '<div class="card game-card jkh-temp"></div>';
            cardArea.innerHTML = '';
            cardArea.parentElement.style.display = 'none';
        };

        this.startTimer(() => {
            cardArea.querySelector('.jkh-card[data-color="black"]').click();
            comicArea.querySelector('.card.jkh-temp').click();
        });

        this.removeTempCards(comicArea);

        comicArea.innerHTML = `
            <div class="card game-card jkh-temp" data-position="before"></div>
            ${comicArea.innerHTML}
            <div class="card game-card jkh-temp" data-position="after"></div>
        `;
            
        const temps = comicArea.querySelectorAll('.card.jkh-temp');
        for(const card of temps){
            card.addEventListener('click', event => {
                if( sentSelection ){
                    return;
                }

                temps.forEach(c => c.classList.remove('selected'));
                selected.position = card.dataset.position;
                card.classList.add('selected');

                if(selected.card !== null){
                    chooseSetupCard();
                }
            });
        }
        
        const cards = cardArea.querySelectorAll('.card.jkh-card');
        for(const card of cards){
            card.addEventListener('click', event => {
                if( sentSelection ){
                    return;
                }

                const index = card.dataset.index;
                
                if(this.player.hand[ index ].color === 'red'){
                    return;
                }
                
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selected.card = this.player.hand[ index ];

                if(selected.position !== null){
                    chooseSetupCard();
                }
            });
        }
    }

    setupPlayerEvents(cardArea) {
        const cards = cardArea.querySelectorAll('.card.jkh-card');
        let playedCard = false;

        this.startTimer(() => {
            cardArea.querySelector('.jkh-card').click();
        });

        for(const card of cards){
            card.addEventListener('click', event => {
                if( playedCard ){
                    return;
                }

                const index = card.dataset.index;

                if(index >= this.player.hand.length){
                    return;
                }

                this.stopTimer();

                card.classList.add('selected');

                this.socket.emit('game-event', 'play-card', [this.player.hand[ index ]]);
                playedCard = true;
            });
        }
    }

    prepareBonusRound(isJudge, introCard, hand, alreadyPlayed = false) {
        this.stopTimer('judge');
        this.roundStyle = 'bonus';
        this.isJudge = isJudge;
        this.player.hand = hand;

        let comicArea = document.getElementById('comic_area');
        if( comicArea ){
            comicArea.innerHTML = `
                <div class="card game-card jkh-temp"></div>

                <div class="card game-card jkh-temp"></div>

                <div class="card game-card jkh-card">
                    <img src="${introCard.image}" />
                </div>
            `;
        }

        let cardArea = document.getElementById('card_area');
        if( cardArea ){
            if( !this.isJudge ){
                cardArea.parentElement.style.display = 'block';
                cardArea.innerHTML = '';
                hand.forEach((card, idx) => {
                    cardArea.innerHTML += `
                        <div class="card game-card jkh-card" data-index="${idx}" data-color="${card.color}">
                            <img src="${card.image}" />
                        </div>
                    `;
                });
                
                this.setupBonusEvents(cardArea);

                if( alreadyPlayed && cards.length > 0 ){
                    cardsToPlay = hand.slice(1, 3);
                    cards.forEach((c, idx) => {
                        if(idx < 2){
                            c.classList.add('selected');
                        }
                    });
                }
            } else {
                cardArea.parentElement.style.display = 'none';
            }
        }
    }
    
    pickSetupCard(introCard, hand) {
        const comicArea = document.getElementById('comic_area');
        const cardArea = document.getElementById('card_area');

        this.roundStyle = 'regular';
        this.isJudge = true;
        this.player.hand = hand;
        
        if( comicArea ){
            comicArea.innerHTML = `
                <div class="card game-card jkh-card">
                    <img src="${introCard.image}" />
                </div>
            `;
        }

        if( cardArea ){
            cardArea.parentElement.style.display = 'block';
            cardArea.innerHTML = '';
            hand.forEach((card, idx) => {
                cardArea.innerHTML += `
                    <div class="card game-card jkh-card" data-index="${idx}" data-color="${card.color}">
                        <img src="${card.image}" />
                    </div>
                `;
            });
        }

        this.setupJudgeEvents(comicArea, cardArea);
    }

    loadPlayerCards(introCard, hand, isJudge = false) {
        const comicArea = document.getElementById('comic_area');
        const cardArea = document.getElementById('card_area');

        this.roundStyle = 'regular';
        this.isJudge = isJudge;
        this.player.hand = hand;

        this.stopTimer();
        this.stopTimer('judge');

        if( comicArea ){
            comicArea.innerHTML = `
                <div class="card game-card jkh-card">
                    <img src="${introCard.image}" />
                </div>
            `;
        }

        if( cardArea ){
            if( isJudge ){
                cardArea.parentElement.style.display = 'none';
            } else {
                cardArea.innerHTML = '';
                cardArea.parentElement.style.display = 'block';
                hand.forEach((card, idx) => {
                    cardArea.innerHTML += `
                        <div class="card game-card jkh-card" data-index="${idx}" data-color="${card.color}">
                            <img src="${card.image}" />
                        </div>
                    `;
                });
            }
        }
    }

    showJokeSetup({card: setupCard, position: position}, playedCard = false) {
        const comicArea = document.getElementById('comic_area');
        const cardArea = document.getElementById('card_area');

        if( comicArea ){
            const setupDisplay = `
                <div class="card game-card jkh-card">
                    <img src="${setupCard.image}" />
                </div>
            `;
            if(position === 'before'){
                comicArea.innerHTML = setupDisplay + comicArea.innerHTML;
            } else {
                comicArea.innerHTML += setupDisplay;
            }
            comicArea.innerHTML += '<div class="card game-card jkh-temp"></div>';
        }

        if( cardArea ){
            this.setupPlayerEvents(cardArea);

            if( playedCard && cards.length > 0){
                cards[0].classList.add('selected');
                this.stopTimer();
            }
        }
    }
    
    loadPlayedCards(playedCards) {
        document.getElementById('card_area').parentElement.style.display = 'none';

        this.clearPlayerReady();
    
        const comicArea = document.getElementById('comic_area');
        let playerCards = [];
        let selectedIdx = 0;
        const showCard = cardIdx => {
            if(cardIdx < 0){
                cardIdx = playedCards.length - 1;
            }

            if(cardIdx >= playedCards.length){
                cardIdx = 0;
            }

            selectedIdx = cardIdx;
            for(const pCard of playerCards){
                const punchline = pCard.querySelectorAll('.punchline');
                punchline.forEach((card, idx) => {
                    if(idx === selectedIdx){
                        card.classList.add('visible');
                    } else {
                        card.classList.remove('visible');
                    }
                });
            }
        };

        if(comicArea){
            let cardDisplay = [];

            this.removeTempCards(comicArea);

            comicArea.querySelectorAll('.jkh-setups, .jkh-punchlines, #choose_button')
                .forEach(element => comicArea.removeChild(element));

            this.fullComic = comicArea.innerHTML;

            playedCards.forEach((cards, idx) => {
                cards.forEach((card, count) => {
                    if(typeof cardDisplay[ count ] === 'undefined'){
                        cardDisplay[ count ] = '';
                    }
                    cardDisplay[ count ] += `<img class="punchline" src="${card.image}" />`;
                });
            });

            if(this.roundStyle === 'bonus'){
                let setupCards = `
                    <div class="jkh-setups">
                        <div class="card game-card jkh-card player-card">
                            ${cardDisplay[0]}
                        </div>
                        <div class="card game-card jkh-card player-card">
                            ${cardDisplay[1]}
                        </div>
                        <button type="button" class="select-button left">&lsaquo;</button>
                        <button type="button" class="select-button right">&rsaquo;</button>
                    </div>
                `;
                comicArea.innerHTML = setupCards + comicArea.innerHTML;
            } else {
                comicArea.innerHTML += `
                    <div class="card game-card jkh-card jkh-punchlines player-card">
                        ${cardDisplay[0]}
                        <button type="button" class="select-button left">&lsaquo;</button>
                        <button type="button" class="select-button right">&rsaquo;</button>
                    </div>
                `;
            }

            if( this.isJudge ){
                this.startTimer(() => {
                    document.getElementById('choose_button').click();
                }, 'judge', Math.max(playedCards.length * 20, PLAYER_TIME));

                comicArea.innerHTML += `
                    <button id="choose_button" class="btn btn-primary flex-center">Choose</button>
                `;
                
                document.getElementById('choose_button').addEventListener('click', () => {
                    this.stopTimer('judge');
                    this.socket.emit('game-event', 'select-card', playedCards[ selectedIdx ][0]);
                });
            }

            playerCards = comicArea.querySelectorAll('.player-card');

            showCard(0);
            comicArea.querySelector('.select-button.left').addEventListener('click', () => showCard(selectedIdx - 1));
            comicArea.querySelector('.select-button.right').addEventListener('click', () => showCard(selectedIdx + 1));
        }
    }
    
    showWinningCards(cards, player) {
        const winnerModal = document.getElementById('winner_modal');

        if( winnerModal ){
            const winningCards = cards.map(c => `<div class="card game-card jkh-card"><img src="${c.image}" /></div>`).join('');
            if(this.roundStyle === 'regular'){
                this.fullComic += winningCards;
            } else {
                this.fullComic = winningCards + this.fullComic;
            }

            winnerModal.querySelector('.modal-body').innerHTML = this.fullComic;
            winnerModal.querySelector('.modal-title .name').innerText = player.name;

            $(winnerModal).modal('show');
        }
    }
    
    updatePlayerScores(players) {
        const playerArea = document.getElementById('player_area');
    
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
                                        Judge
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
        const names = players.map(p => p.name).join(' and ');
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