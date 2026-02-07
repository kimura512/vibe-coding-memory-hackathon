## **パーソナルAIエージェント統合型次世代アラームアプリケーション：技術設計仕様書**

ハッカソンにおける競争優位性を確保し、将来的なスマートフォンアプリへの円滑な移行を見据えた、AIキャラクター駆動型アラームアプリケーションの構築に関する詳細な技術仕様である。本システムは、高度な長期記憶フレームワーク「memU」を中核に据え、ローカル環境での高信頼なデータ永続化、および没入感の高いマルチモーダル・インターフェースを実現することを目的とする。

## **第1章：システムコンセプトとモバイルファーストの設計思想**

設計の最優先事項は、ウェブアプリでありながら、ネイティブのスマホアプリと遜色のないルック・アンド・フィールを実現することである 1。タッチ操作に最適化されたコンポーネント配置、セーフエリアの考慮、およびモバイル特有のインタラクションを模倣する。

### **1.1 キャラクター中心の視覚体験**

チャット画面では、キャラクター画像を画面いっぱいに表示した上でチャットを行うレイアウトを採用する 4。音声会話と文字チャットをシームレスに使い分け、AIが常にユーザーの隣にいるような体験を構築する。

### **1.2 技術スタック詳細**

指定されたモデル名および環境設定を厳密に適用した技術構成は以下の通りである。

  
 

<table><tbody><tr><td><strong>レイヤー</strong></td><td><strong>技術</strong></td><td><strong>バージョン/詳細</strong></td></tr><tr><td><strong>Frontend</strong></td><td>Next.js 15 (App Router)</td><td>React 19 / TypeScript 5.x / Tailwind CSS <sup>6</sup></td></tr><tr><td><strong>Backend</strong></td><td>Python 3.13+ (FastAPI)</td><td>memU統合、ファイル解析処理 <sup>9</sup></td></tr><tr><td><strong>Database</strong></td><td>SQLite</td><td>Prisma ORMによる型安全なデータ操作 <sup>12</sup></td></tr><tr><td><strong>AI (Interaction)</strong></td><td>Gemini API</td><td><strong>gemini-3-flash-preview</strong> (TTT/STT) <sup>9</sup><strong>gemini-2.5-flash-preview-tts</strong> (TTS) <sup>16</sup></td></tr><tr><td><strong>memU (Core LLM)</strong></td><td>OpenAI API</td><td><strong>gpt-4o-mini</strong> (現状のmemU内部LLM) <sup>19</sup><strong>text-embedding-3-small</strong> (埋め込みモデル) <sup>19</sup></td></tr><tr><td><strong>Timezone</strong></td><td>JST固定</td><td>MVP版の標準設定</td></tr></tbody></table>

## **第2章：視覚的インターフェースの詳細設計**

### **2.1 グラスモルフィズムによるキャラクター表示**

背景にキャラクター画像をデカデカと表示しつつ、情報の視認性を確保するために「グラスモルフィズム」を全面的に導入する 18。

*   **Backdrop Blur:** 背景を blur(10px) 程度でぼかすことで、キャラクターの存在感とUIの可読性を両立させる 20。
*   **Semi-transparent Layer:** メッセージバブルは半透明（rgba(255, 255, 255, 0.15)）に設定し、背景を透過させる 20。

### **2.2 モバイル特有のチャットUI**

*   **Thumb Zone:** 片手操作を考慮し、入力フィールドとマイクボタンは画面下部に配置 3。
*   **Dynamic Background:** 感情やアラームの状態に応じてキャラクター画像を動的に切り替える。
*   **Voice Visualizer:** 音声入力/出力中に波形アニメーションを表示し、対話のライブ感を演出する 24。

## **第3章：データ永続化と長期記憶の実装**

### **3.1 SQLiteとPrismaの統合**

ローカル環境での完結を目指し、SQLiteを採用する 12。Prismaを使用することで、スキーマ変更に柔軟に対応しつつ、開発速度を最大化する 8。

  
 

コード スニペット

  
  
 

// prisma/schema.prisma  
datasource db {  
  provider = "sqlite"  
  url      = "file:./dev.db"  
}  
  
model User {  
  id        String   @id @default(uuid())  
  name      String  
  alarms    Alarm  
  character String   @default("default\_char")  
}  
  
model Alarm {  
  id        String   @id @default(uuid())  
  time      String   // HH:mm (JST)  
  isActive  Boolean  @default(true)  
  userId    String  
  user      User     @relation(fields: \[userId\], references: \[id\])  
}  
  
 

### **3.2 memUによるマルチモーダル記憶管理**

memUは **gpt-4o-mini** と **text-embedding-3-small** を活用し、ユーザーの情報を階層的に管理する 19。

*   **ファイルのアップロード:** PDF、Word、Markdown、Textファイルをサポート 20。
*   **memorize機能:** FastAPIを通じてファイルを解析し、memUの /memorize エンドポイントへ送信 19。
*   **プロアクティブな起床:** 記憶された情報（「今日は10時から会議」など）に基づき、**gemini-2.5-flash-preview-tts** を用いて最適な声かけを生成する 19。

## **第4章：対話エンジンの設計（Gemini統合）**

### **4.1 非対称対話モデル**

*   **入力:** テキスト入力、またはブラウザのMediaRecorder APIを用いた音声入力 12。
*   **認識 (STT):** **gemini-3-flash-preview** のマルチモーダル機能を活用して音声をテキスト化 9。
*   **生成 (TTT):** memUの文脈とあわせ、**gemini-3-flash-preview** で応答テキストを生成 9。
*   **合成 (TTS):** **gemini-2.5-flash-preview-tts** で音声合成。感情や口調の制御を行い、キャラクター性を強化する 16。

## **第5章：実装の優先順位（ハッカソン当日）**

1.  **UI/UXの構築:** Next.js + Tailwindでグラスモルフィズムを効かせた「スマホアプリ画面」を完成させる。
2.  **アラーム & SQLite:** SQLiteで設定を保存し、指定時刻に **gemini-2.5-flash-preview-tts** で音声を発火させる。
3.  **memU連携:** **/memorize** を実装し、PDF等のアップロード機能を動作させる。
4.  **対話の洗練:** **gemini-3-flash-preview** のプロンプトを調整し、記憶に基づいたパーソナライズされた起床体験をデモで見せる。

## **第6章：結論**

本仕様は、**gemini-3-flash-preview** および **gemini-2.5-flash-preview-tts** という最新のGeminiモデルを、長期記憶基盤 **memU** と組み合わせることで、単なるツールではない「人格を持ったアラームエージェント」を実現するためのものである。SQLiteによるローカル完結の設計は、ハッカソンにおけるデモの安定性を保証し、JST固定設定は即座の利用可能性を提供する 12。