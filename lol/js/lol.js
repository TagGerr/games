const ucwords = words => (words + '').replace(/^(.)|\s+(.)/g, letter => letter.toUpperCase());

class LolHandler {
    constructor(player, app, socket) {
        this.player = player;
        this.player.aliases = [this.player.id];
        this.app = app;
        this.socket = socket;

        this.turnModal;

        this.modalDisplayed = false;
        this.cards = {};

        this.maxPoints = 0;
        this.round = 0;
        this.unreadMessages = 0;

        this.roundWinners = [];
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

            case 'start-round':
                this.startRound(...data);
                break;

            case 'court-deal':
                this.showCourt(...data);
                break;

            case 'player-turn':
                this.showActivePlayer(...data);
                break;
            
            case 'your-turn':
                this.startTurn(...data);
                break;
            
            case 'guard-guess':
                this.makeGuardGuess(...data);
                break;

            case 'guard-correct':
            case 'guard-incorrect':
                this.evaluateGuard((message === 'guard-correct'), ...data);
                break;

            case 'priest-peek':
                this.choosePriestPeek(...data);
                break;

            case 'priest-card':
                this.showPriestCard(...data);
                break;

            case 'priest-viewed':
                this.evaluatePriest(...data);
                break;

            case 'baron-brawl':
                this.chooseBaronBrawl(...data);
                break;

            case 'baron-view':
                this.viewBaronCard(...data);
                break;

            case 'baron-equal':
            case 'baron-loser':
                this.evaluateBaron((message === 'baron-loser'), ...data);
                break;

            case 'prince-patch':
                this.choosePrincePatch(...data);
                break;

            case 'prince-picked':
                this.viewPrinceCard(...data);
                break;

            case 'prince-replace':
                this.evaluatePrince(...data);
                break;

            case 'king-klepto':
                this.chooseKingKlepto(...data);
                break;

            case 'king-card':
                this.showKingCard(...data);
                break;
            
            case 'king-swap':
                this.evaluateKing(...data);
                break;

            case 'handmaid-help':
                this.evaluateHandmaid(...data);
                break;

            case 'countess-council':
                this.evaluateCountess(...data);
                break;

            case 'princess-purge':
                this.evaluatePrincess(...data);
                break;
            
            case 'no-targets':
                this.handleNoTargets(...data);
                break;

            case 'round-end':
                this.finishRound(...data);
                break;

            case 'player-update':
                this.updatePlayers(...data);
                break;

            case 'game-over':
                this.showWinner(...data);
                break;
                
            case 'invalid-card':
                this.showCardError(...data);
                break;

            default:
                console.log('The game speaks!', message, data);
        }
    }

    isPlayer({id: playerId}) {
        return this.player.aliases.includes(playerId);
    }

    setGameReady(ready) {
        setTimeout(() => {
            const startButton = document.getElementById('start_button');
            if(startButton){
                startButton.disabled = !ready;
            }
        }, 5);
    }

    catchUpPlayer(gameData, callback) {
        this.player.aliases = gameData.aliases;
        this.startGame(gameData.players, gameData.totalAffection);
        if(gameData.court.length > 0){
            this.showCourt(gameData.court);
        }
        this.updateHandCard(gameData.cards[0]);
        this.updatePlayers(...gameData.players);
        this.showActivePlayer(gameData.activePlayer);
        if(this.isPlayer(gameData.activePlayer) && gameData.cards.length > 1){
            this.startTurn(gameData.cards[1]);
        }

        this.round = gameData.actions.length;
        gameData.actions.forEach((round, idx) => {
            this.showRoundLog(idx + 1);
            round.forEach(event => {
                if(event.type === 'win'){
                    this.roundWinners.push({winner: event.player, type: 'unknown'});
                    this.addGameEventLog(`${this.showPlayerName(event.player)} won the round`)
                } else if(event.type === 'handmaid'){
                    this.addGameEventLog(`${this.showPlayerName(event.player)} used Handmaid`);
                } else if( !event.target.hasOwnProperty('id') ){
                    this.addGameEventLog(`${this.showPlayerName(event.player)} discarded ${ucwords(event.type)}`);
                } else {
                    switch(event.type){
                        case 'guard':
                            this.addGameEventLog(`${this.showPlayerName(event.player)} used Guard on ${this.showPlayerName(event.target)}`);
                            if( event.data.outcome ){
                                this.addGameEventLog(`${this.showPlayerName(event.target)} ${this.isPlayer(event.target) ? 'were' : 'was'} eliminated`);
                            }
                            break;
                        
                        case 'priest':
                            this.addGameEventLog(`${this.showPlayerName(event.player)} used Priest on ${this.showPlayerName(event.target)}`);
                            break;
                        
                        case 'baron':
                            this.addGameEventLog(`${this.showPlayerName(event.player)} used Baron on ${this.showPlayerName(event.target)}`);
                            if( event.data.hasOwnProperty('id') ){
                                this.addGameEventLog(`${this.showPlayerName(event.data)} ${this.isPlayer(event.data) ? 'were' : 'was'} eliminated`);
                            }
                            break;
                        
                        case 'prince':
                            this.addGameEventLog(`${this.showPlayerName(event.player)} used Prince on ${this.showPlayerName(event.target)}`);
                            break;

                        case 'king':
                            this.addGameEventLog(`${this.showPlayerName(event.player)} used King on ${this.showPlayerName(event.target)}`);
                            break;
                    }
                }
            });
        });

        callback();
    }

    startGame(players, maxPoints) {
        this.maxPoints = parseInt(maxPoints);

        this.app.innerHTML = `
            <section class="shadow-box">
                <p class="lead text-center mb-0">Your Hand</p>
                <div id="my_affection" class="d-flex justify-content-center"></div>
                <div id="my_hand" class="d-flex justify-content-around"></div>
                <div id="action_area">
                    <button class="btn btn-primary mt-3 mb-2 play-card-button">Play Card</button>
                </div>
            </section>

            <section class="shadow-box">
                <p class="lead text-center mb-0">The Players</p>
                <div id="player_area" class="row"></div>
            </section>

            <div id="drawer">
                <ul class="nav">
                    <li data-drawer="chat">
                        <i class="fa fa-commenting-o fa-flip-horizontal"></i>
                        <span id="chat_count" class="badge badge-pill badge-danger"></span>
                    </li>

                    <li data-drawer="log">
                        <i class="fa fa-list-ul"></i>
                    </li>

                    <li data-drawer="question">
                        <i class="fa fa-question-circle-o"></i>
                    </li>
                </ul>

                <div class="content">
                    <div data-drawer="chat">
                        <div id="chat_box"></div>
                        <div class="input-group">
                            <input type="text" id="chat_text" class="form-control">
                            <span class="input-group-btn">
                                <button id="chat_send" class="btn btn-primary" type="button">
                                    <i class="fa fa-paper-plane"></i>
                                </button>
                            </span>
                        </div>
                    </div>

                    <div data-drawer="log" class="p-0">
                        <ul id="game_log" class="list-group"></ul>
                    </div>

                    <div data-drawer="question" class="help-drawer">
                        <h3>List of Cards</h3>
                        <div class="list-group">
                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">8 &ndash; Princess</h5>
                                    <small class="text-muted">1 card</small>
                                </div>
                                <p class="mb-1">If you discard this card, you are out of the round.</p>
                            </div>
                            
                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">7 &ndash; Countess</h5>
                                    <small class="text-muted">1 card</small>
                                </div>
                                <p class="mb-1">If you have this card and the King or Prince in your hand, you must discard this card.</p>
                            </div>

                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">6 &ndash; King</h5>
                                    <small class="text-muted">1 card</small>
                                </div>
                                <p class="mb-1">Trade hands with another player of your choice.</p>
                            </div>
                            
                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">5 &ndash; Prince</h5>
                                    <small class="text-muted">2 cards</small>
                                </div>
                                <p class="mb-1">Choose any player (including yourself) to discard his or her hand and draw a new card.</p>
                            </div>

                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">4 &ndash; Handmaid</h5>
                                    <small class="text-muted">2 cards</small>
                                </div>
                                <p class="mb-1">Until your next turn, ignore all effects from other players' cards.</p>
                            </div>
                            
                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">3 &ndash; Baron</h5>
                                    <small class="text-muted">2 cards</small>
                                </div>
                                <p class="mb-1">You and another player secretly compare hands. The player with the lower value is out of the round.</p>
                            </div>

                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">2 &ndash; Priest</h5>
                                    <small class="text-muted">2 cards</small>
                                </div>
                                <p class="mb-1">Look at another player's hand.</p>
                            </div>
                            
                            <div class="list-group-item flex-column align-items-start">
                                <div class="d-flex w-100 justify-content-between">
                                    <h5 class="mb-1">1 &ndash; Guard</h5>
                                    <small class="text-muted">5 cards</small>
                                </div>
                                <p class="mb-1">Name a non-Guard card and choose another player. If that player has that card, he or she is out of the round.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="player_turn_modal" data-backdrop="static" tabindex="-1" role="dialog" aria-labelledby="player_turn_modal_label" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h4 class="modal-title" id="player_turn_modal_label"></h4>
                        </div>

                        <div class="modal-body pt-2">
                            <h5 class="mb-3">
                                <small class="card-instructions text-muted font-weight-light d-block mt-1"></small>
                            </h5>

                            <div id="turn_view" class="container"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.turnModal = document.getElementById('player_turn_modal');
        $(this.turnModal)
            .on('shown.bs.modal', () => this.modalDisplayed = true)
            .on('hidden.bs.modal', () => this.modalDisplayed = false);

        const playerArea = document.getElementById('player_area'),
            myHand = document.getElementById('my_hand'),
            myAffection = document.getElementById('my_affection'),
            actionArea = document.getElementById('action_area');

        players.forEach(p => {
            playerArea.innerHTML += `
                <div class="col-lg-3 mt-4">
                    <div data-player-id="${p.id}" class="card player ${this.isPlayer(p) ? 'self' : ''}">
                        <div class="card-body pb-2">
                            <h6 class="card-title">
                                ${p.name}
                                <div class="disconnect-bubbles">
                                    <div class="bounce1"></div>
                                    <div class="bounce2"></div>
                                    <div class="bounce3"></div>
                                </div>
                            </h6>
                            <div class="card-subtitle d-flex">
                                <div class="card-point mr-auto"></div>

                                <div class="d-flex flex-column align-items-start justify-content-around">
                                    <div class="self-badge badge badge-info badge-pill">
                                        You
                                    </div>
                                    <div class="active-badge badge badge-success badge-pill">
                                        Active
                                    </div>
                                    <div class="eliminated-badge badge badge-secondary badge-pill">
                                        Eliminated
                                    </div>
                                </div>

                                <div class="p-2 h4 mb-0 ml-auto">
                                    <span class="affection">${p.affection}</span> <i class="affection-heart fa fa-heart"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        myHand.innerHTML = `
            <div class="card game-card lol-card">
                <img src="http://cards.taggedltd.com/images/lol/back.jpg" alt="card back" />
            </div>
        `;

        myAffection.innerHTML = Array(this.maxPoints).fill('<span class="affection-heart fa fa-heart-o"></span>').join('');

        actionArea.querySelector('.play-card-button').addEventListener('click', event => {
            const chosenCard = myHand.querySelector('.lol-card.selected');
            if(chosenCard && myHand.classList.contains('active')){
                const cardFrom = chosenCard.dataset.from;
                this.socket.emit('game-event', 'play-card', this.cards[ cardFrom ], accepted => {
                    if( accepted ){
                        const cardLeft = cardFrom === 'hand' ? 'draw' : 'hand';
                        this.updateHandCard(this.cards[ cardLeft ]);
                    }
                });
            }
        });

        const drawer = document.getElementById('drawer'),
            drawerTabs = drawer.querySelectorAll('.nav li'),
            drawerContents = drawer.querySelectorAll('.content [data-drawer]'),
            chatInput = drawer.querySelector('#chat_text');

        drawerTabs.forEach(tab => {
            const tabDrawer = tab.dataset.drawer,
                toggleActiveClass = el => {
                    if(el.dataset.drawer === tabDrawer){
                        el.classList.add('active');
                    } else {
                        el.classList.remove('active');
                    }
                };
            
            tab.addEventListener('click', event => {
                if( !drawer.classList.contains('open') ){
                    drawer.classList.add('open');
                } else {
                    const activeDrawer = drawer.querySelector('.content [data-drawer].active');
                    if(activeDrawer && activeDrawer.dataset.drawer === tabDrawer){
                        drawer.classList.remove('open');
                    }
                }

                drawerTabs.forEach(toggleActiveClass);
                drawerContents.forEach(toggleActiveClass);

                if(tabDrawer === 'chat'){
                    this.unreadMessages = 0;
                    document.getElementById('chat_count').innerHTML = '';
                    if( drawer.classList.contains('open') ){
                        chatInput.focus();
                    }
                }
            });
        });

        chatInput.addEventListener('focus', event => {
            setTimeout(() => window.scrollTo({top: 0, behavior: 'smooth'}), 150);
        });
        chatInput.addEventListener('keydown', event => {
            if(event.keyCode === 13){
                event.preventDefault();
                this.sendMessage();
            }
        });
        document.getElementById('chat_send').addEventListener('click', () => this.sendMessage());
    }

    openTurnModal() {
        if( this.modalDisplayed ){
            $(this.turnModal).one('hidden.bs.modal', () => $(this.turnModal).modal('show'));
        } else {
            $(this.turnModal).modal('show');
        }
    }

    closeTurnModal() {
        $(this.turnModal).modal('hide');
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = '';
        this.turnModal.querySelector('.card-instructions').innerHTML = '';
        this.turnModal.querySelector('#turn_view').innerHTML = '';
    }

    updateHandCard(card) {
        this.cards.hand = card;
        this.cards.draw = {};
        const myHand = document.getElementById('my_hand');
        if(myHand){
            myHand.classList.remove('active');
            myHand.innerHTML = `
                <div class="card game-card lol-card" data-from="hand" data-value="${card.value}">
                    <img src="${card.image}" alt="${card.name}" />
                </div>
            `;
        }
    }

    startRound(player) {
        this.round += 1;
        this.updateHandCard(player.cards[0]);

        const playerArea = document.getElementById('player_area');
        if( playerArea ){
            playerArea.querySelectorAll('.card.player.out').forEach(player => player.classList.remove('out'));
        }

        this.showRoundLog(this.round);
    }

    showRoundLog(round) {
        const gameLog = document.getElementById('game_log');
        if( gameLog ){
            gameLog.innerHTML += `
                <li class="round list-group-item">
                    <span class="lead">Round ${round}</span>
                    <ol class="events">
                        <li class="empty-events list-item-group">No events yet</li>
                    </ol>
                </li>
            `;
        }
    }

    addGameEventLog(log) {
        const gameLog = document.getElementById('game_log');
        if( gameLog ){
            gameLog.querySelector('.round:last-of-type .events').innerHTML += `
                <li>${log}</li>
            `;
        }
    }

    showCourt(cards) {
        const playerArea = document.getElementById('player_area');
        if( playerArea ){
            const courtElement = playerArea.querySelector('#court_cards');
            if( courtElement ){
                playerArea.removeChild(courtElement);
            }

            const sortValues = (a, b) => a.value - b.value;
            const displayPoint = card => `<div class="card-point mr-2 align-self-center">${card.value}</div>`;

            playerArea.innerHTML += `
                <div id="court_cards" class="col-lg-3 mt-4">
                    <div class="card player">
                        <div class="card-body pb-2">
                            <h6 class="card-title">
                                Court Cards
                            </h6>
                            <div class="card-subtitle d-flex">
                                ${cards.sort(sortValues).map(displayPoint).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    showActivePlayer(player) {
        const playerArea = document.getElementById('player_area');
        if( playerArea ){
            playerArea.querySelectorAll(`.card.player.active`).forEach(pl => {
                pl.classList.remove('active');
            });
            playerArea.querySelector(`.card.player[data-player-id="${player.id}"]`).classList.add('active');
        }
    }

    startTurn(card) {
        this.cards.draw = card;

        const myHand = document.getElementById('my_hand');
        if( myHand ){
            myHand.innerHTML += `
                <div class="card game-card lol-card" data-from="draw" data-value="${card.value}">
                    <img src="${card.image}" alt="${card.name}" />
                </div>
            `;
            myHand.classList.add('active');

            const playerCards = myHand.querySelectorAll('.lol-card');
            playerCards.forEach(card => {
                card.addEventListener('click', () => {
                    playerCards.forEach(c => {
                        if(c === card){
                            c.classList.add('selected');
                        } else {
                            c.classList.remove('selected');
                        }
                    });
                });
            });
        }
    }

    makeOptions(things, value = ({name}) => name) {
        return things.map((t, idx) => `<option value="${idx}">${value(t)}</option>`).join('');
    }

    showCardError(message) {
        this.openTurnModal();
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Oops...';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            <p>
                ${message}.
            </p>
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <button class="btn btn-danger card-error-button ml-auto">Got it</button>
            </div>
        `;

        this.turnModal.querySelector('.card-error-button').addEventListener('click', event => {
            event.preventDefault();
            this.closeTurnModal();
        });
    }

    /*** Card 1: Guard ***/
    makeGuardGuess(targets, types, callback) {
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Guard Odette';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            Choose a player and a card.
            <br />
            If that player has that card, they're out!
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <div class="form-group col-12">
                    <label for="guard_select_target">Choose a target</label>
                    <select class="form-control" id="guard_select_target">
                        ${this.makeOptions(targets)}
                    </select>
                </div>
            </div>

            <div class="row">
                <div class="form-group col-12">
                    <label for="guard_select_type">Guess their card</label>
                    <select class="form-control" id="guard_select_type">
                        ${this.makeOptions(types)}
                    </select>
                </div>
            </div>

            <div class="row">
                <button class="btn btn-primary guard-guess-button ml-auto">Make a guess</button>
            </div>
        `;

        const guessButton = this.turnModal.querySelector('.guard-guess-button'),
            selectedTarget = this.turnModal.querySelector('#guard_select_target'),
            selectedType = this.turnModal.querySelector('#guard_select_type');
        
        guessButton.addEventListener('click', event => {
            event.preventDefault();
            callback(targets[ selectedTarget.value ], types[ selectedType.value ]);
            guessButton.disabled = true;
        });

        this.openTurnModal();
    }

    evaluateGuard(correct, player, target, guess) {
        this.closeTurnModal();
        
        const type = correct ? 'info' : 'error',
            title = correct ? 'Correct' : 'Incorrect',
            text = `
                <h4 class="font-weight-light">${title}!</h4>
                <strong>${this.showPlayerName(player)}</strong> guessed that <strong>${this.showPlayerName(target)}</strong> had <em>${guess.name}</em>
            `;
        
        new Noty({text, type}).show();
        this.updatePlayers(player, target);

        this.addGameEventLog(`${this.showPlayerName(player)} used Guard on ${this.showPlayerName(target)}`);
        if( correct ){
            this.addGameEventLog(`${this.showPlayerName(target)} ${this.isPlayer(target) ? 'were' : 'was'} eliminated`);
        }
    }

    /*** Card 2: Priest ***/
    choosePriestPeek(targets, callback) {
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Priest Tomas';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = 'Choose a player to see their card';
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <div class="form-group col-12">
                    <label for="guard_select_target">Choose a target</label>
                    <select class="form-control" id="guard_select_target">
                        ${this.makeOptions(targets)}
                    </select>
                </div>
            </div>

            <div class="row">
                <button class="btn btn-primary priest-peek-button ml-auto">See their card</button>
            </div>
        `;

        const peekButton = this.turnModal.querySelector('.priest-peek-button'),
            selectedTarget = this.turnModal.querySelector('#guard_select_target');
    
        peekButton.addEventListener('click', event => {
            event.preventDefault();
            callback(targets[ selectedTarget.value ]);
            peekButton.disabled = true;
        });

        this.openTurnModal();
    }

    showPriestCard(player, card, callback) {
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row justify-content-center">
                <div class="card border-secondary m-3">
                    <div class="card-header">${player.name}</div>
                    <div class="card-body">
                        <div class="card game-card lol-card">
                            <img src="${card.image}" alt="${card.name}" />
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <button class="btn btn-primary priest-close-button ml-auto">Got it</button>
            </div>
        `;

        this.turnModal.querySelector('.priest-close-button').addEventListener('click', event => {
            event.preventDefault();
            this.closeTurnModal();
            callback();
        });
    }

    evaluatePriest(player, target) {
        const text = `
            <h4 class="font-weight-light">Peek!</h4>
            <strong>${this.showPlayerName(player)}</strong> used <em>Priest Tomas</em> on <strong>${this.showPlayerName(target)}</strong>
        `;
        
        new Noty({text, type: 'info'}).show();
        this.updatePlayers(player, target);

        this.addGameEventLog(`${this.showPlayerName(player)} used Priest on ${this.showPlayerName(target)}`);
    }

    /*** Card 3: Baron ***/
    chooseBaronBrawl(targets, callback) {
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Baron Talus';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            Choose a player to compare hands.
            <br />
            Beware: the player with the lower card value will be eliminated!
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <div class="form-group col-12">
                    <label for="guard_select_target">Choose a target</label>
                    <select class="form-control" id="baron_select_target">
                        ${this.makeOptions(targets)}
                    </select>
                </div>
            </div>

            <div class="row">
                <button class="btn btn-primary baron-brawl-button ml-auto">Compare cards</button>
            </div>
        `;

        const brawlButton = this.turnModal.querySelector('.baron-brawl-button'),
            targetSelect = this.turnModal.querySelector('#baron_select_target');
    
        brawlButton.addEventListener('click', event => {
            event.preventDefault();
            callback(targets[ targetSelect.value ]);
            brawlButton.disabled = true;
        });

        this.openTurnModal();
    }

    viewBaronCard(player, card, callback) {
        const myTurn = this.modalDisplayed;
        let topText, bottomText;

        if(card.value > this.cards.hand.value){
            bottomText = 'Unfortunately, your card is lower and you have been eliminated.';
        } else if(card.value === this.cards.hand.value){
            bottomText = 'However, you both have the same card so no one has been eliminated.';
        } else {
            bottomText = 'Your card is higher and they have been eliminated.';
        }

        if( myTurn ){
            topText = `You have successfully used the Baron against ${player.name}!`;
        } else {
            topText = `${player.name} has used the Baron against you!`;
            this.openTurnModal();
        }

        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Baron Talus';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            ${topText}
            <br />
            ${bottomText}
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row justify-content-around">
                <div class="card border-secondary m-3">
                    <div class="card-header">You</div>
                    <div class="card-body">
                        <div class="card game-card lol-card">
                            <img src="${this.cards.hand.image}" alt="${this.cards.hand.name}" />
                        </div>
                    </div>
                </div>

                <div class="card border-secondary m-3">
                    <div class="card-header">${player.name}</div>
                    <div class="card-body">
                        <div class="card game-card lol-card">
                            <img src="${card.image}" alt="${card.name}" />
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <button class="btn btn-primary baron-close-button ml-auto">Got it</button>
            </div>
        `;

        this.turnModal.querySelector('.baron-close-button').addEventListener('click', event => {
            event.preventDefault();
            this.closeTurnModal();
            callback();
        });
    }

    evaluateBaron(hasLoser, player, target, loser) {
        const type = hasLoser ? 'error' : 'info',
            loserName = hasLoser ? `<strong>${this.showPlayerName(loser)}</strong>` : 'No one',
            text = `
                <h4 class="font-weight-light">Brawl!</h4>
                <strong>${this.showPlayerName(player)}</strong> used <em>Baron Talus</em> on <strong>${this.showPlayerName(target)}</strong>
                <br />
                <br />
                ${loserName} ${hasLoser && this.isPlayer(loser) ? 'have' : 'has'} been eliminated
            `;
        
        new Noty({text, type}).show();
        this.updatePlayers(player, target);

        this.addGameEventLog(`${this.showPlayerName(player)} used Baron on ${this.showPlayerName(target)}`);
        if( hasLoser ){
            this.addGameEventLog(`${this.showPlayerName(loser)} ${this.isPlayer(loser) ? 'were' : 'was'} eliminated`);
        }
    }
    
    /*** Card 4: Handmaid ***/
    evaluateHandmaid(player) {
        this.closeTurnModal();

        const text = `
            <h4 class="font-weight-light">Help!</h4>
            <strong>${this.showPlayerName(player)}</strong> requested protection from <em>Handmaid Susannah</em> and cannot be targeted until their next turn
        `;

        new Noty({text, type: 'info'}).show();
        this.updatePlayers(player);

        this.addGameEventLog(`${this.showPlayerName(player)} used Handmaid`);
    }

    /*** Card 5: Prince ***/
    choosePrincePatch(targets, callback) {
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Prince Arnaud';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            Choose a player to discard their current card and draw a new one.
            <br />
            (Psst! You <em>can</em> choose yourself)
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <div class="form-group col-12">
                    <label for="guard_select_target">Choose a target</label>
                    <select class="form-control" id="prince_select_target">
                        ${this.makeOptions(targets, t => this.showPlayerName(t, 'Yourself'))}
                    </select>
                </div>
            </div>

            <div class="row">
                <button class="btn btn-primary prince-patch-button ml-auto">Replace hand</button>
            </div>
        `;

        const patchButton = this.turnModal.querySelector('.prince-patch-button'),
            selectedTarget = this.turnModal.querySelector('#prince_select_target');
    
        patchButton.addEventListener('click', event => {
            event.preventDefault();
            patchButton.disabled = true;
            if( !this.isPlayer(targets[ selectedTarget.value ]) ){
                this.closeTurnModal();
            }
            callback(targets[ selectedTarget.value ]);
        });

        this.openTurnModal();
    }

    viewPrinceCard(prince, cards, callback) {
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Prince Arnaud';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            ${this.showPlayerName(prince)} used the Prince against you!
            <br />
            The bad news is that your card was discarded. The good news is that you get a replacement card!
        `;

        let bodyText = '';
        if(cards.length > 0){
            bodyText = `
                <div class="card-body">
                    <div class="card game-card lol-card">
                        <img src="${cards[0].image}" alt="${cards[0].name}" />
                    </div>
                </div>
            `;
        } else {
            bodyText = `
                <div class="card-body">
                    Oh no! You didn't get a replacement card...
                    <br />
                    Either you were holding the Princess or the deck ran out of cards. Unfortunately, this means that there was no good news and you have been eliminated.
                </div>
            `;
        }

        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row justify-content-center">
                <div class="card border-secondary m-3">
                    <div class="card-header">Replacement Card</div>
                    ${bodyText}
                </div>
            </div>

            <div class="row">
                <button class="btn btn-primary prince-close-button ml-auto">Got it</button>
            </div>
        `;

        if( !this.modalDisplayed ){
            this.openTurnModal();
        }

        if(cards.length > 0){
            this.updateHandCard(cards[0]);
        }

        this.turnModal.querySelector('.prince-close-button').addEventListener('click', event => {
            event.preventDefault();
            this.closeTurnModal();
            callback();
        });
    }

    evaluatePrince(player, target) {
        this.closeTurnModal();

        const text = `
            <h4 class="font-weight-light">Patch!</h4>
            <strong>${this.showPlayerName(player)}</strong> used <em>Prince Arnaud</em> on <strong>${this.showPlayerName(target)}</strong>
        `;
    
        new Noty({text, type: 'info'}).show();
        this.updatePlayers(player, target);

        this.addGameEventLog(`${this.showPlayerName(player)} used Prince on ${this.showPlayerName(target)}`);
    }

    /*** Card 6: King ***/
    chooseKingKlepto(targets, callback) {
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'King Arnaud IV';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            Choose a player to take their card.
            <br />
            They'll get your card in return.
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <div class="form-group col-12">
                    <label for="king_select_target">Choose a target</label>
                    <select class="form-control" id="king_select_target">
                        ${this.makeOptions(targets)}
                    </select>
                </div>
            </div>

            <div class="row">
                <button class="btn btn-primary king-klepto-button ml-auto">Trade cards</button>
            </div>
        `;

        const kleptoButton = this.turnModal.querySelector('.king-klepto-button'),
            selectedTarget = this.turnModal.querySelector('#king_select_target');
    
        kleptoButton.addEventListener('click', event => {
            event.preventDefault();
            callback(targets[ selectedTarget.value ]);
            kleptoButton.disabled = true;
        });

        this.openTurnModal();
    }

    showKingCard(king, target, cards, callback) {
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'King Arnaud IV';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            ${this.showPlayerName(king)} used the King against ${this.showPlayerName(target)}!
            <br />
            Your cards have been swapped. Your new card is displayed below.
        `;

        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row justify-content-center">
                <div class="card border-secondary m-3">
                    <div class="card-header">Swapped Card</div>
                    <div class="card-body">
                        <div class="card game-card lol-card">
                            <img src="${cards[0].image}" alt="${cards[0].name}" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="row">
                <button class="btn btn-primary king-close-button ml-auto">Got it</button>
            </div>
        `;

        if( !this.isPlayer(king) ){
            this.openTurnModal();
        }

        this.updateHandCard(cards[0]);

        this.turnModal.querySelector('.king-close-button').addEventListener('click', event => {
            event.preventDefault();
            this.closeTurnModal();
            callback();
        });
    }

    evaluateKing(player, target) {
        this.closeTurnModal();

        const text = `
            <h4 class="font-weight-light">Klepto!</h4>
            <strong>${this.showPlayerName(player)}</strong> used <em>King Arnaud IV</em> on <strong>${this.showPlayerName(target)}</strong>
        `;
    
        new Noty({text, type: 'info'}).show();
        this.updatePlayers(player, target);

        this.addGameEventLog(`${this.showPlayerName(player)} used King on ${this.showPlayerName(target)}`);
    }

    /*** Card 7: Countess ***/
    evaluateCountess(player) {
        this.closeTurnModal();

        const text = `
            <h4 class="font-weight-light">Council!</h4>
            <strong>${player.name}</strong> discarded <em>Countess Wilhelmina</em>
            <br />
            <br />
            Do they have the King or Prince? Neither??
        `;
    
        new Noty({text, type: 'info'}).show();
        this.updatePlayers(player);

        this.addGameEventLog(`${this.showPlayerName(player)} discarded Countess`);
    }

    /*** Card 8: Princess ***/
    evaluatePrincess(player) {
        const text = `
            <h4 class="font-weight-light">Purged!</h4>
            <strong>${player.name}</strong> discarded <em>Princess Annette</em>
            <br />
            <br />
            They are out for the rest of this round
        `;
    
        new Noty({text, type: 'info'}).show();
        this.updatePlayers(player);

        this.addGameEventLog(`${this.showPlayerName(player)} discarded Princess`);
    }

    handleNoTargets(player, type) {
        this.closeTurnModal();

        const cardTitle = type.charAt(0).toUpperCase() + type.substr(1),
            text = `
                <h4 class="font-weight-light">No Targets!</h4>
                <strong>${player.name}</strong> discarded a <em>${cardTitle}</em> because there were no available targets
            `;

        new Noty({text, type: 'error'}).show();
        this.updatePlayers(player);

        this.addGameEventLog(`${this.showPlayerName(player)} discarded ${cardTitle}`);
    }

    finishRound(players, winner, finalPlayers, callback) {
        const playerName = this.showPlayerName(winner.player);
        const playerWins = this.isPlayer(winner.player);
        const playerPronoun = playerWins ? 'You' : 'They';
        const playerPossPronoun = playerWins ? 'Your' : 'Their';

        let roundWinner = {
            winner,
            type: 'elimination'
        };
        let winCondition = 'All other players were eliminated';
        if(finalPlayers.length > 1){
            roundWinner.type = 'showdown';
            winCondition = `${playerPossPronoun} winning card was <strong class="text-dark">${winner.card.name}</strong>`;
            if(finalPlayers[0].card.value === finalPlayers[1].card.value){
                roundWinner.discardValue = winner.discardValue;
                winCondition += ` (tie-breaking discard points: ${winner.discardValue})`;
            }
        }

        this.roundWinners.push(roundWinner);
        this.addGameEventLog(`${playerName} won the round`);
        this.updatePlayers(...players.map(p => ({...p, discards: []})));

        this.openTurnModal();
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = 'Round Over!';
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            <p>
                <strong class="text-dark">${playerName}</strong> won this round!
                <br />
                ${playerPronoun} now have ${winner.player.affection} affection point${winner.player.affection === 1 ? '' : 's'}.
            </p>
            <p>
                ${winCondition}.
            </p>
            <p>
                When all players are ready, the next round will begin.
            </p>
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <button class="btn btn-primary round-end-button ml-auto">Ready!</button>
            </div>
        `;

        this.turnModal.querySelector('.round-end-button').addEventListener('click', event => {
            event.preventDefault();
            this.closeTurnModal();
            callback();
        });
    }

    showWinner(players, finalPlayers) {
        const names = players.map(p => p.player.name).join(' and ');
        
        let roundWinner = {};
        let winCondition = 'All other players were eliminated';

        if(players.length === 1){
            const winner = players[0];
            const playerPossPronoun = this.isPlayer(winner.player) ? 'Your' : 'Their';
            roundWinner = {
                winner,
                type: 'elimination'
            };

            winCondition = `${playerPossPronoun} winning card was <strong class="text-dark">${winner.card.name}</strong>`;
            if(finalPlayers.length > 1){
                roundWinner.type = 'showdown';
                if(finalPlayers[0].card.value === finalPlayers[1].card.value){
                    roundWinner.discardValue = winner.discardValue;
                    winCondition += ` (tie-breaking discard points: ${winner.discardValue})`;
                }
            }
        } else {
            winCondition = 'The game is over and there is more than one winner. Weird!';
            roundWinner = {
                players,
                type: 'madness'
            };
        }

        this.roundWinners.push(roundWinner);

        const recapList = this.roundWinners.map((win, idx) => {
            let round = idx + 1;
            let result = '';
            const playerName = typeof win.players !== 'undefined' ? win.players.map(p => p.player.name).join(' and ') : win.winner.player.name;
            result = `<srong>${playerName}</srong> won by ${win.type}`;
            if(win.type === 'showdown' && typeof win.discardValue !== 'undefined'){
                result += ` with a discard value of ${win.discardValue}`;
            }
            return {round, result}
        }).reduce((a, r) => a + `<dt>Round ${r.round}</dt><dl>${r.result}</dl>`, '');

        this.openTurnModal();
        this.turnModal.querySelector('#player_turn_modal_label').innerHTML = `${names} win${players.length === 1 ? 's' : ''}!`;
        this.turnModal.querySelector('.modal-body .card-instructions').innerHTML = `
            <p>
                ${winCondition}.
            </p>

            <div class="card">
                <h5 class="card-header">Game Recap</h5>
                <div class="card-block p-3 game-recap">
                    <dl>
                        ${recapList}
                    </dl>
                </div>
            </div>
        `;
        this.turnModal.querySelector('#turn_view').innerHTML = `
            <div class="row">
                <button class="btn btn-danger game-end-button ml-auto">Quit</button>
            </div>
        `;

        this.turnModal.querySelector('.game-end-button').addEventListener('click', event => {
            event.preventDefault();
            this.closeTurnModal();
            this.socket.emit('leave-game');
        });
    }

    updatePlayers(...players) {
        const myAffection = document.getElementById('my_affection'),
            playerArea = document.getElementById('player_area');
        for(const player of players){
            if( this.isPlayer(player) ){
                myAffection.querySelectorAll('.affection-heart').forEach((heart, idx) => {
                    if(idx < player.affection){
                        heart.classList.remove('fa-heart-o');
                        heart.classList.add('fa-heart');
                    } else {
                        heart.classList.remove('fa-heart');
                        heart.classList.add('fa-heart-o');
                    }
                });
            }

            const lastDiscard = player.discards.length > 0 ? player.discards.pop().value : '';
            const playerCard = playerArea.querySelector(`.card.player[data-player-id="${player.id}"]`);
            if( player.isPlaying ){
                playerCard.classList.remove('out');
            } else {
                playerCard.classList.add('out');
            }
            playerCard.querySelector('.card-point').innerHTML = lastDiscard;
            playerCard.querySelector('.affection').innerHTML = player.affection;
        }
    }

    showPlayerName({id: id, name: name}, selfName = 'You') {
        return this.isPlayer({id}) ? selfName : name;
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

    receiveMessage() {
        const drawer = document.getElementById('drawer');
        if( drawer ){
            const activeDrawer = drawer.querySelector('.content .active');
            if( !drawer.classList.contains('open') || activeDrawer == null || activeDrawer.dataset.drawer !== 'chat' ){
                this.unreadMessages += 1;
                document.getElementById('chat_count').innerHTML = this.unreadMessages;
            }
        }
    }
}