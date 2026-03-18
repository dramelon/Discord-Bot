/**
 * Generates a simple math problem (addition or subtraction).
 * @returns {Object} An object containing the question and the correct answer.
 */
function generateMathProblem() {
    const operations = ['+', '-'];
    const op = operations[Math.floor(Math.random() * operations.length)];
    const a = Math.floor(Math.random() * 20) + 1; // 1-20
    const b = Math.floor(Math.random() * 20) + 1; // 1-20

    let question;
    let answer;

    if (op === '+') {
        question = `${a} + ${b}`;
        answer = a + b;
    } else {
        // Ensure result is positive for simplicity
        const [max, min] = a >= b ? [a, b] : [b, a];
        question = `${max} - ${min}`;
        answer = max - min;
    }

    return { question, answer: answer.toString() };
}

module.exports = { generateMathProblem };
