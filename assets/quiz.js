/* Self-assessment quiz.
 *
 * Reads assets/quiz-data.json, which scripts/build_quiz_data.py compiles from
 * question_banks/public/ only. The exam banks live outside site/ and never reach the
 * browser — do not add a code path that loads them.
 *
 * Deep links: quiz.html?bank=03&n=20&mode=study starts immediately.
 */
(function () {
  "use strict";

  var DATA_URL = "assets/quiz-data.json";
  var state = { banks: [], questions: [], answers: [], index: 0, mode: "study" };

  var el = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------------ helpers

  /** Fisher-Yates, on a copy. */
  function shuffled(items) {
    var out = items.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  /** Set text, then let KaTeX pick up any $…$ inside it. Questions are authored with
   *  LaTeX, so this runs on every string that comes from a bank. */
  function setMath(node, text) {
    node.textContent = text;
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(node, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false
        });
      } catch (err) { /* leave the plain text in place */ }
    }
  }

  function show(name) {
    ["setup", "quiz", "results"].forEach(function (screen) {
      el("quiz-" + screen).hidden = screen !== name;
    });
  }

  // ------------------------------------------------------------------- setup

  function buildBankPicker() {
    var select = el("quiz-bank");
    var all = document.createElement("option");
    all.value = "all";
    all.textContent = "All chapters";
    select.appendChild(all);

    var sections = {};
    state.banks.forEach(function (bank) {
      var name = bank.section || "Other";
      if (!sections[name]) {
        sections[name] = document.createElement("optgroup");
        sections[name].label = name;
        select.appendChild(sections[name]);
      }
      var option = document.createElement("option");
      option.value = bank.id;
      option.textContent = bank.id + " — " + bank.title.replace(/^\d+\.\s*/, "") +
        " (" + bank.questionCount + ")";
      sections[name].appendChild(option);
    });
  }

  /** Return a copy of `question` with its five answers in a random order.
   *
   *  The banks were written with the correct answer first far more often than not
   *  (about two thirds of them), so serving the options in file order would teach
   *  students to pick A. Shuffling here also means a second attempt at the same
   *  question is not answered from memory of the position.
   */
  function withShuffledOptions(question) {
    var order = shuffled(question.options.map(function (_, i) { return i; }));
    return Object.assign({}, question, {
      options: order.map(function (i) { return question.options[i]; }),
      comments: order.map(function (i) { return question.comments[i]; }),
      correctIndex: order.indexOf(question.correctIndex)
    });
  }

  function pool() {
    var id = el("quiz-bank").value;
    if (id === "all") {
      return state.banks.reduce(function (acc, bank) {
        return acc.concat(bank.questions.map(function (q) {
          return Object.assign({}, q, { bank: bank });
        }));
      }, []);
    }
    var bank = state.banks.filter(function (b) { return b.id === id; })[0];
    return bank ? bank.questions.map(function (q) {
      return Object.assign({}, q, { bank: bank });
    }) : [];
  }

  function start() {
    var chosen = shuffled(pool());
    var wanted = el("quiz-count").value;
    if (wanted !== "all") chosen = chosen.slice(0, parseInt(wanted, 10));
    if (!chosen.length) return;
    chosen = chosen.map(withShuffledOptions);

    state.questions = chosen;
    state.answers = new Array(chosen.length).fill(null);
    state.index = 0;
    state.mode = el("quiz-mode").value;
    show("quiz");
    renderQuestion();
  }

  // -------------------------------------------------------------- the question

  function renderQuestion() {
    var question = state.questions[state.index];
    var answered = state.answers[state.index];

    el("quiz-progress").textContent =
      "Question " + (state.index + 1) + " of " + state.questions.length;
    el("quiz-progress-bar").style.width =
      (100 * state.index / state.questions.length) + "%";
    el("quiz-chapter").textContent = question.bank.title;

    setMath(el("quiz-question"), question.question);

    var list = el("quiz-options");
    list.textContent = "";
    question.options.forEach(function (text, i) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.setAttribute("aria-pressed", "false");

      var label = document.createElement("span");
      label.className = "quiz-option-key";
      label.textContent = "ABCDE".charAt(i);
      button.appendChild(label);

      var body = document.createElement("span");
      body.className = "quiz-option-text";
      setMath(body, text);
      button.appendChild(body);

      button.addEventListener("click", function () { choose(i); });
      item.appendChild(button);
      list.appendChild(item);
    });

    el("quiz-feedback").hidden = true;
    el("quiz-next").textContent =
      state.index === state.questions.length - 1 ? "Finish" : "Next";
    el("quiz-next").disabled = answered === null;
    el("quiz-back").disabled = state.index === 0;

    if (answered !== null) markAnswered(answered);
  }

  function optionButtons() {
    return Array.prototype.slice.call(
      el("quiz-options").querySelectorAll(".quiz-option"));
  }

  function choose(i) {
    // In study mode an answer is final, so the feedback cannot be gamed.
    if (state.mode === "study" && state.answers[state.index] !== null) return;
    state.answers[state.index] = i;
    markAnswered(i);
    el("quiz-next").disabled = false;
  }

  function markAnswered(chosenIndex) {
    var question = state.questions[state.index];
    optionButtons().forEach(function (button, i) {
      button.setAttribute("aria-pressed", String(i === chosenIndex));
      button.classList.toggle("is-chosen", i === chosenIndex);
      if (state.mode === "study") {
        button.classList.toggle("is-correct", i === question.correctIndex);
        button.classList.toggle("is-wrong",
          i === chosenIndex && i !== question.correctIndex);
        button.disabled = true;
      }
    });

    if (state.mode !== "study") return;

    var box = el("quiz-feedback");
    box.hidden = false;
    box.className = "quiz-feedback " +
      (chosenIndex === question.correctIndex ? "is-correct" : "is-wrong");
    box.textContent = "";
    var verdict = document.createElement("strong");
    verdict.textContent = chosenIndex === question.correctIndex
      ? "Correct" : "Not quite";
    box.appendChild(verdict);
    var comment = document.createElement("p");
    setMath(comment, question.comments[chosenIndex] || "");
    box.appendChild(comment);
  }

  function move(delta) {
    var next = state.index + delta;
    if (next < 0) return;
    if (next >= state.questions.length) return finish();
    state.index = next;
    renderQuestion();
  }

  // ------------------------------------------------------------------ results

  function finish() {
    var right = state.questions.filter(function (question, i) {
      return state.answers[i] === question.correctIndex;
    }).length;
    var total = state.questions.length;

    el("quiz-score").textContent = right + " / " + total;
    el("quiz-score-pct").textContent = Math.round(100 * right / total) + "%";

    var review = el("quiz-review");
    review.textContent = "";
    state.questions.forEach(function (question, i) {
      var chosen = state.answers[i];
      var ok = chosen === question.correctIndex;

      var card = document.createElement("li");
      card.className = "quiz-review-item " + (ok ? "is-correct" : "is-wrong");

      var head = document.createElement("p");
      head.className = "quiz-review-q";
      setMath(head, (i + 1) + ". " + question.question);
      card.appendChild(head);

      var yours = document.createElement("p");
      yours.className = "quiz-review-answer";
      setMath(yours, (ok ? "✓ " : "✗ ") +
        (chosen === null ? "(not answered)" : question.options[chosen]));
      card.appendChild(yours);

      if (!ok) {
        var right_ = document.createElement("p");
        right_.className = "quiz-review-correct";
        setMath(right_, "→ " + question.options[question.correctIndex]);
        card.appendChild(right_);
      }

      var why = document.createElement("p");
      why.className = "quiz-review-comment";
      setMath(why, question.comments[chosen === null ? question.correctIndex : chosen] || "");
      card.appendChild(why);

      if (question.bank.chapterHref) {
        var link = document.createElement("a");
        link.href = question.bank.chapterHref;
        link.className = "quiz-review-link";
        link.textContent = "Read the chapter →";
        card.appendChild(link);
      }
      review.appendChild(card);
    });

    show("results");
    window.scrollTo(0, 0);
  }

  // --------------------------------------------------------------------- boot

  function applyDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var bank = params.get("bank");
    if (bank && state.banks.some(function (b) { return b.id === bank; })) {
      el("quiz-bank").value = bank;
    }
    var n = params.get("n");
    if (n && Array.prototype.some.call(el("quiz-count").options,
      function (o) { return o.value === n; })) {
      el("quiz-count").value = n;
    }
    var mode = params.get("mode");
    if (mode === "study" || mode === "exam") el("quiz-mode").value = mode;
    if (bank) start();
  }

  function boot() {
    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error(response.status + " " + response.statusText);
        return response.json();
      })
      .then(function (data) {
        state.banks = data.banks || [];
        if (!state.banks.length) throw new Error("no question banks in the payload");
        buildBankPicker();
        el("quiz-total").textContent = state.banks.reduce(function (n, b) {
          return n + b.questionCount;
        }, 0);
        el("quiz-loading").hidden = true;
        el("quiz-setup-form").hidden = false;
        applyDeepLink();
      })
      .catch(function (error) {
        el("quiz-loading").textContent =
          "The questions could not be loaded (" + error.message + "). " +
          "Reload the page; if it keeps failing, tell the teacher.";
      });

    el("quiz-start").addEventListener("click", start);
    el("quiz-next").addEventListener("click", function () { move(1); });
    el("quiz-back").addEventListener("click", function () { move(-1); });
    el("quiz-quit").addEventListener("click", function () { show("setup"); });
    el("quiz-again").addEventListener("click", start);
    el("quiz-new").addEventListener("click", function () { show("setup"); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
