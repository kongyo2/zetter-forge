import { useEmit } from "./chain";

/** 原稿用紙のマスに 1 字ずつ書く見出し */
const WELCOME_HEADLINE = "キャストを、手元で育てる。";

export function Welcome({ hasCasts }: { hasCasts: boolean }) {
  const emit = useEmit();
  return (
    <div className="welcome">
      <h1 className="manuscript" aria-label={WELCOME_HEADLINE}>
        {Array.from(WELCOME_HEADLINE).map((char, index) => (
          <span key={index} className="manuscript-cell" aria-hidden="true">
            {char}
          </span>
        ))}
      </h1>
      <p className="welcome-lead">
        Zetter
        のキャスト作成画面と同じ項目・同じ上限で、キャストの設定をパソコンに保存します。Zetter
        に載せる前の下書き、載せたあとの控え、手元での改良に使えます。
      </p>
      <ul className="welcome-points">
        <li>
          画像は Zetter と同じ比率・大きさで切り抜いて、そのまま Zetter で選べるファイルにします。
        </li>
        <li>
          右側の「Zetter で完成するときの確認」に、Zetter で止められる点や保存されない点が出ます。
        </li>
        <li>
          「Zetter へ写す」のタブで、Zetter
          の作成画面と同じ順に1項目ずつコピーできます。書き換えた項目も分かります。
        </li>
        <li>保存するたびに前の版を残します。</li>
      </ul>
      <div className="welcome-actions">
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={() => emit({ type: "library/new" })}
        >
          新しいキャストを作る
        </button>
        {hasCasts ? <p className="note">左の一覧から保存したキャストを開けます。</p> : null}
      </div>
    </div>
  );
}
