import React from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'
const LandingPage = () => {
  const router=useNavigate();
  return (
    <div className='landingPageContainer'>
    <nav>
        <div className='navHeader'>
            {/* <h2>Video Meet</h2> */}
            <img src="/VideoMeetLogo.png" alt=""  className="videoMeetLogo"/>
        </div>
        <div className='navlist'>
          <p onClick={()=>{
           router("/w321e");
          }}>Join As Guest</p>
          <p onClick={()=>{
            router("/auth");
          }}>Register</p>

         <div onClick={()=>{
          router("/auth");
         }} role='button'>
             <p>Login</p>
         </div>
            
        </div>
        </nav>

        <div className="landingMainContainer">
          <div>
            <h1> <span style={{color:"#FF9839"}}>Connect</span> with your loved Ones</h1>
            <p> Cover Distance By Video Meet</p>
            <div role='button'>
              <Link to={"/auth"}>Get Started</Link> 
            </div>
          </div>
          <div>
            <img src='/mobile.png' alt=''/>
          </div>

        </div>

    
    
     
    </div>
  )
}

export default LandingPage
