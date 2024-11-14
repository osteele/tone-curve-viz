import { useState } from "react";
import "./App.css";
import PhotoEditor from "./PhotoEditor";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <PhotoEditor />
    </div>
  );
}

export default App;
