$(document).ready(function() {
	if( sessionStorage['login'] == 'true' ) {
		pushMessage('success', "GoodBye!");
		sessionStorage.removeItem('login');
	}

	$('#back-top').hide();

	$(window).scroll(function() {
		if( $(this).scrollTop() > 100 ) {
			$('#back-top').fadeIn();
		} else {
			$('#back-top').fadeOut();
		}
	});

	$('#back-top a').on('click', function() {
		$('body,html').animate({
			scrollTop:0
		}, 800);
		return false;
	});

});