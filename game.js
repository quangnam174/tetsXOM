document.addEventListener("DOMContentLoaded", () => {
    const board = document.getElementById("board");
    const message = document.getElementById("message");
    const overlay = document.getElementById("overlay");
    const winnerMessage = document.getElementById("winner-message");
    const startOverlay = document.getElementById("start-overlay");
    const startBtn = document.getElementById("start-btn");
    const resetBtn = document.getElementById("reset-btn");
    const qrCodeBtn = document.getElementById('generate-qr');
    const qrCodeContainer = document.getElementById('qrcode');
    let currentPlayer = "X";
    let gameActive = false; // Bắt đầu trò chơi chưa hoạt động
    let gameState = Array(10000).fill("");
    let turnTimeout;
    let turnInterval;
    let xTimeLeft = 30;
    let oTimeLeft = 30;
    let gameEnded = false;
    let visibilityTimeouts = []; // Mảng lưu trữ các timeout

    // Kết nối WebSocket
    let socket = new WebSocket("ws://localhost:8080");

    socket.onopen = function (e) {
        console.log("[open] Kết nối đã được thiết lập");
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.type === "move") {
            handleRemoteMove(data);
        }
        if (data.type === "reset") {
            resetGame(false); // Không gửi lại thông báo reset
        }
        if (data.type === "start") {
            startGame(false); // Không gửi lại thông báo start
        }
    };

    socket.onclose = function (event) {
        if (event.wasClean) {
            console.log(`[close] Kết nối đóng sạch sẽ, code=${event.code} reason=${event.reason}`);
        } else {
            console.log('[close] Kết nối bị đóng đột ngột');
        }
    };

    socket.onerror = function (error) {
        console.log(`[error] Lỗi: ${error.message}`);
    };

    qrCodeBtn.addEventListener('click', function () {
        const url = "index.html";
        const qr = qrcode(0, 'L');
        qr.addData(url);
        qr.make();
        qrCodeContainer.innerHTML = qr.createImgTag(6); // Kích thước của mã QR
    });

    // Hiển thị overlay bắt đầu trò chơi khi trang được tải
    startOverlay.classList.add("active");

    // Các điều kiện chiến thắng
    const winningConditions = generateWinningConditions();

    function generateWinningConditions() {
        let conditions = [];
        for (let i = 0; i < 10000; i += 100) {
            for (let j = 0; j < 96; j++) {
                conditions.push([i + j, i + j + 1, i + j + 2, i + j + 3, i + j + 4]);
            }
        }
        for (let i = 0; i < 9600; i++) {
            conditions.push([i, i + 100, i + 200, i + 300, i + 400]);
        }
        for (let i = 0; i < 9600; i++) {
            if (i % 100 < 96) {
                conditions.push([i, i + 101, i + 202, i + 303, i + 404]);
            }
        }
        for (let i = 4; i < 10000; i++) {
            if (i % 100 > 3) {
                conditions.push([i, i + 99, i + 198, i + 297, i + 396]);
            }
        }
        return conditions;
    }

    function handleCellClick(event) {
        const clickedCell = event.target;
        const clickedCellIndex = Array.from(board.children).indexOf(clickedCell);

        if (gameState[clickedCellIndex] !== "" || !gameActive) {
            return;
        }

        handleCellPlayed(clickedCell, clickedCellIndex);
        handleResultValidation();

        // Gửi dữ liệu qua WebSocket
        socket.send(JSON.stringify({
            type: "move",
            index: clickedCellIndex,
            player: currentPlayer
        }));
    }

    function handleRemoteMove(data) {
        const { index, player } = data;
        gameState[index] = player;
        const cell = board.children[index];
        cell.innerText = player;
        cell.classList.add("played");

        clearTimeout(turnTimeout);
        clearInterval(turnInterval);
        startTurnTimeout();
    }

    function handleCellPlayed(clickedCell, index) {
        if (gameEnded) return; // Dừng nếu trò chơi đã kết thúc

        gameState[index] = currentPlayer;
        clickedCell.innerText = currentPlayer;
        clickedCell.classList.add("played");

        const initialTimeout = setTimeout(() => {
            if (gameEnded) return; // Dừng nếu trò chơi đã kết thúc
            clickedCell.innerText = "";
            function toggleVisibility() {
                const visibilityOffTimeout = setTimeout(() => {
                    if (gameEnded) return; // Dừng nếu trò chơi đã kết thúc
                    clickedCell.innerText = currentPlayer;
                    const visibilityOnTimeout = setTimeout(() => {
                        if (gameEnded) return; // Dừng nếu trò chơi đã kết thúc
                        clickedCell.innerText = "";
                        toggleVisibility();
                    }, 5000);
                    visibilityTimeouts.push(visibilityOnTimeout);
                }, 15000);
                visibilityTimeouts.push(visibilityOffTimeout);
            }
            toggleVisibility();
        }, 10000);
        visibilityTimeouts.push(initialTimeout);

        clearTimeout(turnTimeout);
        clearInterval(turnInterval);
        startTurnTimeout();
    }

    function startTurnTimeout() {
        clearInterval(turnInterval);

        if (currentPlayer === "X") {
            xTimeLeft = 30;
        } else {
            oTimeLeft = 30;
        }

        updateTimerDisplay();

        turnInterval = setInterval(() => {
            if (currentPlayer === "X") {
                xTimeLeft--;
            } else {
                oTimeLeft--;
            }

            updateTimerDisplay();

            if (xTimeLeft === 0 || oTimeLeft === 0) {
                clearInterval(turnInterval);
                clearTimeout(turnTimeout);
                gameActive = false;
                showOverlay(`Người chơi ${currentPlayer === "X" ? "O" : "X"} đã thắng do hết thời gian`, false); // Không trì hoãn
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        document.getElementById("x-timer").innerText = `X: ${xTimeLeft}s`;
        document.getElementById("o-timer").innerText = `O: ${oTimeLeft}s`;
    }

    function handleResultValidation() {
        let roundWon = false;
        let winningCombination;
        for (let i = 0; i < winningConditions.length; i++) {
            const [a, b, c, d, e] = winningConditions[i];
            if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c] && gameState[a] === gameState[d] && gameState[a] === gameState[e]) {
                roundWon = true;
                winningCombination = [a, b, c, d, e];
                break;
            }
        }

        if (roundWon) {
            gameEnded = true; // Đặt cờ để báo hiệu trò chơi đã kết thúc
            message.innerText = `Người chơi ${currentPlayer} đã chiến thắng`;
            gameActive = false;
            highlightWinningCells(winningCombination);

            clearTimeout(turnTimeout);
            clearInterval(turnInterval);

            // Đặt đồng hồ về 30
            xTimeLeft = 30;
            oTimeLeft = 30;
            updateTimerDisplay();

            showOverlay(`Người chơi ${currentPlayer} đã chiến thắng`, true); // Truyền delay
            return;
        }

        if (!gameState.includes("")) {
            message.innerText = "Hòa";
            gameEnded = true; // Đặt cờ để báo hiệu trò chơi đã kết thúc
            gameActive = false;
            showOverlay("Hòa", true); // Truyền delay
            return;
        }

        currentPlayer = currentPlayer === "X" ? "O" : "X";
        message.innerText = `It's ${currentPlayer}'s turn`;
        startTurnTimeout();
    }

    function highlightWinningCells(winningCombination) {
        winningCombination.forEach(index => {
            board.children[index].classList.add("highlight");
            board.children[index].innerText = gameState[index];
        });

        Array.from(board.children).forEach((cell, index) => {
            if (gameState[index]) {
                cell.innerText = gameState[index];
            }
        });
    }

    function showOverlay(text, delay) {
        if (delay) {
            setTimeout(() => {
                winnerMessage.innerText = text;
                overlay.classList.add("active");
            })
        }
    }

    function resetGame() {
        currentPlayer = "X";
        gameActive = false; // Trò chơi chưa bắt đầu
        gameState = Array(10000).fill("");
        message.innerText = `It's ${currentPlayer}'s turn`;
        overlay.classList.remove("active");
        startOverlay.classList.add("active"); // Hiển thị overlay bắt đầu trò chơi

        visibilityTimeouts.forEach(timeout => clearTimeout(timeout));
        visibilityTimeouts = [];

        Array.from(board.children).forEach(cell => {
            cell.innerText = "";
            cell.classList.remove("highlight");
            cell.classList.remove("played");
        });

        clearTimeout(turnTimeout);
        clearInterval(turnInterval);
        xTimeLeft = 30;
        oTimeLeft = 30;
        updateTimerDisplay();
    }

    function startGame() {
        gameActive = true;
        startOverlay.classList.remove("active"); // Ẩn overlay bắt đầu trò chơi
        startTurnTimeout();
    }

    function createBoard() {
        for (let i = 0; i < 10000; i++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.addEventListener("click", handleCellClick);
            board.appendChild(cell);
        }
    }

    createBoard();
    message.innerText = `It's ${currentPlayer}'s turn`;

    startBtn.addEventListener("click", startGame); // Thêm sự kiện cho nút Bắt đầu
    resetBtn.addEventListener("click", resetGame);
    updateTimerDisplay();
});
