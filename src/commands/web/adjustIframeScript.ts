export const adjustIframeScript = `
    <!-- 
      To prevent redirects / preserve the URL when streaming 
      HTML from Viya, we recommend using the _debug=2 parameter
      which will serve the content in an iframe.  The following 
      code will then modify the parent iframe to serve the content
      in full screen.
    -->
    <script>
      window.frameElement.style="height:100%;width:100%;";
      window.frameElement.setAttribute("allowfullscreen","")
      window.frameElement.setAttribute("frameborder","0")
      window.frameElement.setAttribute("marginheight","0")
      window.frameElement.setAttribute("marginwidth","0")
      window.frameElement.setAttribute("scrolling","auto")
    </script>
`
